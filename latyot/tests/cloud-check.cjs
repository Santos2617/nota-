// Run explicitly with FRAGA_TEST_USERNAME and FRAGA_TEST_PASSWORD in the environment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('node:crypto');
function instance() {
  const window = { location:{origin:'https://fragasucatas.vercel.app'}, supabase:{
    createClient:(url,key)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  }};
  const context=vm.createContext({window,document:{getElementById:()=>null,querySelectorAll:()=>[]},console,crypto,fetch,localStorage:{getItem:()=>null}});
  for (const file of ['supabase-config.js','supabase-api.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js',file),'utf8'),context);
  return window.API;
}
async function main() {
  assert.ok(process.env.FRAGA_TEST_USERNAME && process.env.FRAGA_TEST_PASSWORD,'Test credentials required');
  const a=instance(),b=instance(),publicClient=instance(),customerClient=instance(),otherClient=instance();
  await Promise.all([a.init(),b.init(),publicClient.init(),customerClient.init(),otherClient.init()]);
  await a.login(process.env.FRAGA_TEST_USERNAME,process.env.FRAGA_TEST_PASSWORD);
  await b.login(process.env.FRAGA_TEST_USERNAME,process.env.FRAGA_TEST_PASSWORD);
  assert.equal(a.user.role,'ADMIN');assert.equal(a.user.id,b.user.id);
  const tag='sync_'+crypto.randomBytes(6).toString('hex');
  const password=crypto.randomBytes(24).toString('base64url');
  const users=[],notes=[],customers=[];
  let portfolio;
  try {
    for (const suffix of ['a','b']) {
      const username=tag+suffix;
      const user=await a.createUser({name:'Teste de sincronização',username,email:username+'@example.invalid',password,role:'CLIENTE'});
      users.push(user.id);
    }
    await customerClient.login(tag+'a',password);
    await otherClient.login(tag+'b',password);
    const all=await a.getCustomers();
    for (const uid of users) customers.push(all.find(c=>c.user_id===uid).id);
    const created=await a.createNote({customer_id:customers[0],data_compra:'02/10/2026',descricao:'Teste temporário '+tag,
      public_visible_value:false,itens:[{descricao:'Item de teste',quantidade:2,valor_unitario:12.5}]});
    notes.push(created.id);
    const read=await b.getNoteDetail(created.id);assert.equal(Number(read.valor_total),25);
    await b.updateNoteStatus(created.id,'INVALIDADA');
    assert.equal((await a.getNoteDetail(created.id)).status,'INVALIDADA');
    const own=await customerClient.getNoteDetail(created.id);assert.equal(own.id,created.id);
    await assert.rejects(()=>otherClient.getNoteDetail(created.id));
    await assert.rejects(()=>otherClient.updateNoteStatus(created.id,'VALIDA'));
    await assert.rejects(()=>publicClient.getNoteDetail(created.id));
    const publicNote=await publicClient.validateNote(created.public_id);
    assert.equal(publicNote.status,'INVALIDADA');assert.equal(publicNote.valor_total,null);
    assert.equal(publicNote.itens[0].valor_unitario,null);
    for (const field of ['cliente_doc','cliente_endereco','cliente_cep','customers']) assert.equal(publicNote[field],undefined);
    const otherItems=await otherClient.client.from('note_items').select('*').eq('note_id',created.id);
    assert.equal(otherItems.data.length,0);
    const rejected=await otherClient.client.from('profiles').update({role:'ADMIN'}).eq('id',users[1]);
    assert.ok(rejected.error);
    const escalation=await otherClient.client.functions.invoke('fraga-api',{body:{action:'create-user',role:'ADMIN'}});
    assert.ok(escalation.error);
    const invalid=await a.client.rpc('save_note',{payload:{customer_id:customers[0],data_compra:'02/10/2026',
      itens:[{descricao:'Invalid item',quantidade:-1,valor_unitario:1}]}});
    assert.ok(invalid.error);
    assert.equal((await a.getNotes()).filter(n=>n.customer_id===customers[0]).length,1);
    portfolio=await a.createPortfolioItem({title:tag,category:'Teste',description:'Teste temporário',image_url:'/assets/images/fraga-logo.png',published:false});
    assert.ok((await b.getAdminPortfolio()).some(p=>p.id===portfolio.id));
    assert.ok(!(await publicClient.getPortfolio()).some(p=>p.id===portfolio.id));
    await b.deleteNote(created.id);
    notes.splice(notes.indexOf(created.id),1);
    assert.equal((await publicClient.validateNote(created.public_id)).found,false);
    await assert.rejects(()=>a.getNoteDetail(created.id));
    console.log('PASS: independent sessions share additions, edits and deletions; client ownership; public QR privacy; role escalation blocked; failed transaction rolls back; draft portfolio stays private.');
  } finally {
    for (const id of notes) await a.deleteNote(id);
    if (portfolio) await a.deletePortfolioItem(portfolio.id);
    for (const id of customers) await a.deleteCustomer(id);
    console.log('TEST_AUTH_USERS='+JSON.stringify(users));
    await Promise.all([a,b,customerClient,otherClient].filter(x=>x.user).map(x=>x.logout()));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
