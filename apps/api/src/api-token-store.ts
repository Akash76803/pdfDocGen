import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export type ApiTokenRecord = {
  id: string;
  ownerSubject: string;
  ownerEmail?: string;
  label: string;
  secretHash: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

export type IssuedApiToken = {
  token: string;
  tokenId: string;
  label: string;
  createdAt: string;
};

export interface ApiTokenStore {
  create(record: ApiTokenRecord): Promise<void>;
  get(tokenId: string): Promise<ApiTokenRecord | null>;
  touch(tokenId: string, usedAt: string): Promise<void>;
  revoke(tokenId: string, ownerSubject?: string): Promise<boolean>;
}

export function hashApiTokenSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function verifyApiTokenSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiTokenSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createApiTokenRecord(owner: { subject:string; email?:string }, label = 'Default integration token'): { issued:IssuedApiToken; record:ApiTokenRecord } {
  const tokenId = randomUUID().replace(/-/g,'').slice(0,20);
  const secret = randomBytes(32).toString('base64url');
  const token = `pdfdg_${tokenId}_${secret}`;
  const createdAt = new Date().toISOString();
  return {
    issued:{ token, tokenId, label, createdAt },
    record:{
      id:tokenId,
      ownerSubject:owner.subject,
      ...(owner.email ? { ownerEmail:owner.email } : {}),
      label,
      secretHash:hashApiTokenSecret(secret),
      createdAt,
    },
  };
}

export function parseApiToken(value: string): { tokenId:string; secret:string } | null {
  const match=/^pdfdg_([A-Za-z0-9]{8,64})_([A-Za-z0-9_-]{32,128})$/.exec(value.trim());
  return match ? {tokenId:match[1]!,secret:match[2]!} : null;
}

export class InMemoryApiTokenStore implements ApiTokenStore {
  private readonly records=new Map<string,ApiTokenRecord>();
  async create(record:ApiTokenRecord){ this.records.set(record.id,{...record}); }
  async get(tokenId:string){ return this.records.get(tokenId) ? {...this.records.get(tokenId)!} : null; }
  async touch(tokenId:string,usedAt:string){ const current=this.records.get(tokenId); if(current)this.records.set(tokenId,{...current,lastUsedAt:usedAt}); }
  async revoke(tokenId:string,ownerSubject?:string){
    const current=this.records.get(tokenId);
    if(!current || (ownerSubject && current.ownerSubject!==ownerSubject)) return false;
    this.records.set(tokenId,{...current,revokedAt:new Date().toISOString()});
    return true;
  }
}
