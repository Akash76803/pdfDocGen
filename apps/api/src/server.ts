import { createServer } from 'node:http';
import { UnconfiguredDocumentGenerationService } from '@document-tool/generation-core';
import { createApiHandler } from './app.js';

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const handler = createApiHandler({ generationService: new UnconfiguredDocumentGenerationService() });
createServer((req,res)=>{ void handler(req,res); }).listen(port,host,()=>{
  console.log(`Document Builder API listening on http://${host}:${port}`);
});
