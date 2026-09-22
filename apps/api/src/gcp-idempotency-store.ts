import { createHash } from 'node:crypto';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import type {
  ApiIdempotencyStore,
  IdempotencyBeginResult,
  IdempotencyOperation,
  IdempotencyRecord,
} from './idempotency.js';

type PersistedRecord = Omit<IdempotencyRecord<never>,'result'> & {
  resultObjectPath?: string;
};

function encodeResult(value:unknown):string {
  return JSON.stringify(value,(_key,item)=>{
    if (item instanceof Uint8Array) {
      return {__documentBuilderType:'Uint8Array',base64:Buffer.from(item).toString('base64')};
    }
    return item;
  });
}

function decodeResult(value:string):unknown {
  return JSON.parse(value,(_key,item)=>{
    if (item && typeof item === 'object' && item.__documentBuilderType === 'Uint8Array' && typeof item.base64 === 'string') {
      return new Uint8Array(Buffer.from(item.base64,'base64'));
    }
    return item;
  });
}

export class GcpApiIdempotencyStore<T = unknown> implements ApiIdempotencyStore<T> {
  constructor(
    private readonly firestore:Firestore,
    private readonly storage:Storage,
    private readonly bucketName:string,
    private readonly objectPrefix='document-builder/idempotency',
  ) {}

  private documentId(owner:string,operation:IdempotencyOperation,key:string) {
    return createHash('sha256').update(`${owner}\u0000${operation}\u0000${key}`).digest('hex');
  }

  private ref(owner:string,operation:IdempotencyOperation,key:string) {
    return this.firestore.collection('documentBuilderIdempotency').doc(this.documentId(owner,operation,key));
  }

  private objectPath(owner:string,operation:IdempotencyOperation,key:string,fingerprint:string) {
    const ownerHash=createHash('sha256').update(owner).digest('hex').slice(0,16);
    const keyHash=createHash('sha256').update(key).digest('hex').slice(0,16);
    return `${this.objectPrefix}/${ownerHash}/${operation}/${keyHash}/${fingerprint}.json`;
  }

  async begin(input:{key:string;owner:string;operation:IdempotencyOperation;fingerprint:string}):Promise<IdempotencyBeginResult<T>> {
    const ref=this.ref(input.owner,input.operation,input.key);
    const outcome=await this.firestore.runTransaction(async transaction=>{
      const snapshot=await transaction.get(ref);
      if (!snapshot.exists) {
        const now=new Date().toISOString();
        const record:PersistedRecord={
          key:input.key,
          owner:input.owner,
          operation:input.operation,
          fingerprint:input.fingerprint,
          status:'pending',
          createdAt:now,
          updatedAt:now,
        };
        transaction.create(ref,record);
        return {state:'started' as const,record};
      }
      const record=snapshot.data() as PersistedRecord;
      if (record.fingerprint !== input.fingerprint) return {state:'conflict' as const,record};
      if (record.status === 'pending') return {state:'in-progress' as const,record};
      return {state:'replay' as const,record};
    });

    if (outcome.state !== 'replay') return outcome as IdempotencyBeginResult<T>;
    const objectPath=outcome.record.resultObjectPath;
    if (!objectPath) throw new Error('Completed idempotency record is missing its result object.');
    const [bytes]=await this.storage.bucket(this.bucketName).file(objectPath).download();
    return {
      state:'replay',
      record:{...outcome.record,result:decodeResult(bytes.toString('utf8')) as T},
    };
  }

  async complete(input:{key:string;owner:string;operation:IdempotencyOperation;fingerprint:string;result:T}):Promise<void> {
    const ref=this.ref(input.owner,input.operation,input.key);
    const objectPath=this.objectPath(input.owner,input.operation,input.key,input.fingerprint);
    await this.storage.bucket(this.bucketName).file(objectPath).save(encodeResult(input.result),{
      resumable:false,
      contentType:'application/json',
      preconditionOpts:{ifGenerationMatch:0},
    }).catch(async error=>{
      const code=typeof error==='object'&&error&&'code'in error?Number((error as {code:unknown}).code):0;
      if (code!==412) throw error;
    });

    await this.firestore.runTransaction(async transaction=>{
      const snapshot=await transaction.get(ref);
      if (!snapshot.exists) throw new Error('Idempotency reservation disappeared before completion.');
      const record=snapshot.data() as PersistedRecord;
      if (record.fingerprint !== input.fingerprint) throw new Error('Idempotency fingerprint changed before completion.');
      transaction.update(ref,{
        status:'completed',
        updatedAt:new Date().toISOString(),
        resultObjectPath:objectPath,
        completedAt:FieldValue.serverTimestamp(),
      });
    });
  }

  async release(input:{key:string;owner:string;operation:IdempotencyOperation;fingerprint:string}):Promise<void> {
    const ref=this.ref(input.owner,input.operation,input.key);
    await this.firestore.runTransaction(async transaction=>{
      const snapshot=await transaction.get(ref);
      if (!snapshot.exists) return;
      const record=snapshot.data() as PersistedRecord;
      if (record.status === 'pending' && record.fingerprint === input.fingerprint) transaction.delete(ref);
    });
  }
}
