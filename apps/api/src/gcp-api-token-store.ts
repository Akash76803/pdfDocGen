import { Firestore } from '@google-cloud/firestore';
import type { ApiTokenRecord, ApiTokenStore } from './api-token-store.js';

export class FirestoreApiTokenStore implements ApiTokenStore {
  constructor(private readonly firestore: Firestore) {}

  private doc(tokenId:string) {
    return this.firestore.collection('documentBuilderApiTokens').doc(tokenId);
  }

  async create(record:ApiTokenRecord):Promise<void> {
    await this.doc(record.id).create(record);
  }

  async get(tokenId:string):Promise<ApiTokenRecord|null> {
    const snapshot=await this.doc(tokenId).get();
    return snapshot.exists ? snapshot.data() as ApiTokenRecord : null;
  }

  async touch(tokenId:string,usedAt:string):Promise<void> {
    await this.doc(tokenId).set({lastUsedAt:usedAt},{merge:true});
  }

  async revoke(tokenId:string,ownerSubject?:string):Promise<boolean> {
    return await this.firestore.runTransaction(async transaction=>{
      const ref=this.doc(tokenId);
      const snapshot=await transaction.get(ref);
      if(!snapshot.exists) return false;
      const current=snapshot.data() as ApiTokenRecord;
      if(ownerSubject && current.ownerSubject!==ownerSubject) return false;
      transaction.set(ref,{revokedAt:new Date().toISOString()},{merge:true});
      return true;
    });
  }
}

export function createFirestoreApiTokenStore(projectId:string|undefined,databaseId:string):FirestoreApiTokenStore {
  return new FirestoreApiTokenStore(new Firestore({...(projectId?{projectId}:{}),databaseId}));
}
