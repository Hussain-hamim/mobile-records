import {photoUrl,photoKey,verifyPhoto,type StoredPhoto} from '../_shared/r2-photos.ts';
function assert(value:unknown){if(!value)throw new Error('Assertion failed');}
const photo:StoredPhoto={id:'10000000-0000-4000-8000-000000000001',shop_id:'20000000-0000-4000-8000-000000000001',record_id:'30000000-0000-4000-8000-000000000001',slot:'person',state:'pending',bytes:100,md5:'a'.repeat(32),preview_bytes:20,preview_md5:'b'.repeat(32)};
function setup(){Deno.env.set('R2_ACCOUNT_ID','a'.repeat(32));Deno.env.set('R2_PHOTO_BUCKET','synthetic-private-photos');Deno.env.set('R2_ACCESS_KEY_ID','test-access');Deno.env.set('R2_SECRET_ACCESS_KEY','test-secret');}
Deno.test('object-specific signatures bind size, JPEG type, checksum, create-only and short expiry',async()=>{
 setup();const upload=await photoUrl(photo,'PUT'),read=await photoUrl(photo,'GET');const u=new URL(upload.url),r=new URL(read.url);
 assert(u.searchParams.get('X-Amz-Expires')==='300');assert(r.searchParams.get('X-Amz-Expires')==='60');
 for(const h of ['content-type','content-length','content-md5','if-none-match'])assert(u.searchParams.get('X-Amz-SignedHeaders')?.split(';').includes(h));
 assert(upload.headers['If-None-Match']==='*');assert(u.pathname.endsWith(photoKey(photo)));assert(!r.searchParams.get('X-Amz-SignedHeaders')?.includes('content-md5'));
});
Deno.test('verification checks both versions and rejects unexpected bytes or non-JPEG content',async()=>{
 setup();const original=globalThis.fetch;let invalid=false,calls=0;
 globalThis.fetch=async(input,init)=>{const request=new Request(input,init);calls++;const preview=request.url.endsWith('/preview.jpg');
  if(request.method==='HEAD')return new Response(null,{headers:{'content-length':String(preview?20:100),'content-type':'image/jpeg','etag':'"'+(invalid?'c':preview?'b':'a').repeat(32)+'"'}});
  return new Response(new Uint8Array([255,216,255]),{status:206});
 };
 try{await verifyPhoto(photo);assert(calls===4);invalid=true;let rejected=false;try{await verifyPhoto(photo);}catch(e){rejected=e instanceof Error&&e.message==='photoChecksumFailed';}assert(rejected);}finally{globalThis.fetch=original;}
});
