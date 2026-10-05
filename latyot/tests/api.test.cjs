const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function api() {
  const context = vm.createContext({window:{},localStorage:{getItem:()=>null}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/supabase-api.js'),'utf8'),context);
  return context.window.API;
}
test('failed writes propagate and never report local success', async () => {
  const instance = api();
  const failed = { error:{message:'Failed to fetch'} };
  const query = {delete(){return this;},update(){return this;},insert(){return this;},eq(){return this;},select(){return this;},single:async()=>failed};
  instance.client = {from:()=>query,rpc:async()=>failed};
  for (const run of [()=>instance.deleteNote(1),()=>instance.createNote({}),()=>instance.updateNoteStatus(1,'INVALIDADA'),
    ()=>instance.createCustomer({nome:'Test'}),()=>instance.deleteCustomer(1),()=>instance.updateCompany({name:'Test'})]) {
    await assert.rejects(run,/não foi salva/);
  }
});
test('complete print details preserve full name, document and address', () => {
  const note=api().formatNote({customers:{nome:'Ana Teste',cpf_cnpj:'123.456.789-00',endereco:'Rua Teste, 1',cidade:'Fortaleza',estado:'CE',cep:'60000-000'}});
  assert.equal(note.cliente_nome,'Ana Teste');assert.equal(note.cliente_doc,'123.456.789-00');
  assert.equal(note.cliente_endereco,'Rua Teste, 1');assert.equal(note.cliente_cep,'60000-000');
});
test('legacy and new printed QR links resolve to validation route', () => {
  for (const hash of ['#validar-nota/test-id','#/validar-nota/test-id']) {
    const context=vm.createContext({window:{location:{hash},addEventListener(){}}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/router.js'),'utf8'),context);
    const route=new context.window.Router({}).getRouteInfo();
    assert.equal(route.mainSection,'validar-nota');assert.equal(route.param,'test-id');
  }
});
test('public validation uses only the public endpoint', async () => {
  const instance=api();let action;
  instance.edge=async(a,p)=>{action=a;return {found:true,cliente_mascarado:'A*** T***'};};
  const result=await instance.validateNote('test-id');
  assert.equal(action,'validate');assert.equal(result.cliente_doc,undefined);
});

test('print renderer separates complete invoices from public certificates', async () => {
  for (const publicCertificate of [false,true]) {
    const fields={};
    const printArea={innerHTML:'',querySelector:selector=>fields[selector] ||= {textContent:''}};
    const detail={public_id:'test-public-id',numero_nota:'FS-2026-000001',data_compra:'05/10/2026',status:'VALIDA',
      cliente_nome:'Ana Maria Teste',cliente_doc:'123.456.789-00',cliente_endereco:'Rua Teste, 1',
      cliente_cidade:'Fortaleza',cliente_estado:'CE',cliente_cep:'60000-000',itens:[]};
    let privateReads=0,publicReads=0;
    const window={};
    const context=vm.createContext({window,setTimeout(){},console,
      document:{addEventListener(){},querySelectorAll:()=>[],body:{style:{}},getElementById:()=>printArea},
      UI:{escapeHTML:value=>String(value),showToast(message){throw new Error(message);}},
      API:{getNoteDetail:async()=>{privateReads++;return detail;},
        validateNote:async()=>{publicReads++;return {public_id:detail.public_id,numero_nota:detail.numero_nota,
          status:'VALIDA',cliente_mascarado:'A*** M*** T***',itens:[]};}}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8'),context);
    await window.printDoc(detail.public_id,publicCertificate);
    assert.equal(privateReads,publicCertificate?0:1);
    assert.equal(publicReads,publicCertificate?1:0);
    assert.equal(fields['[data-print-customer="name"]'].textContent,publicCertificate?'A*** M*** T***':'Ana Maria Teste');
    if (publicCertificate) {
      assert.ok(!printArea.innerHTML.includes('data-print-customer="document"'));
      assert.ok(!printArea.innerHTML.includes('data-print-customer="address"'));
    } else {
      assert.equal(fields['[data-print-customer="document"]'].textContent,detail.cliente_doc);
      assert.equal(fields['[data-print-customer="address"]'].textContent,'Rua Teste, 1 - Fortaleza/CE - CEP: 60000-000');
    }
  }
});
