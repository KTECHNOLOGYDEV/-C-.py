const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = 8080;
const DATA_FILE = './db.json';

app.use(cors());
app.use(bodyParser.json());

// Utilidades para manipular "banco"
function readDB() { 
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({users:[], history:[], saldo:[]}));
  return JSON.parse(fs.readFileSync(DATA_FILE)); 
}
function writeDB(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db,null,2)); }

// Cadastro/Login simples
app.post('/api/login', (req,res)=>{
  const {email,senha} = req.body;
  let db = readDB();
  let user = db.users.find(u=>u.email===email && u.senha===senha);
  if(!user) return res.json({error:"Usuário ou senha inválidos"});
  res.json({ok:true, nome:user.nome, email:user.email});
});
app.post('/api/cadastro', (req,res)=>{
  const {nome,email,senha} = req.body;
  let db = readDB();
  if(db.users.find(u=>u.email===email)) return res.json({error:"Já existe usuário"});
  db.users.push({nome,email,senha});
  writeDB(db);
  res.json({ok:true});
});

// Saldo
app.get('/api/saldo', (req,res)=>{
  const {email} = req.query;
  let db = readDB();
  let saldo = db.saldo.find(s=>s.email===email)?.saldo || 0;
  res.json({saldo});
});
app.post('/api/saldo', (req,res)=>{
  const {email, valor} = req.body;
  let db = readDB();
  let reg = db.saldo.find(s=>s.email===email);
  if(reg) reg.saldo += valor;
  else db.saldo.push({email,saldo:valor});
  writeDB(db);
  res.json({ok:true, saldo: reg ? reg.saldo : valor});
});

// Consulta CNPJ + desconto de saldo + histórico
app.post('/api/consulta', async (req,res)=>{
  const {email, cnpj} = req.body;
  let db = readDB();
  let reg = db.saldo.find(s=>s.email===email);
  if(!reg || reg.saldo<2) return res.json({error:"Saldo insuficiente"});
  try {
    const api = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    const data = await api.json();
    if(data.error) return res.json({error:data.error});
    reg.saldo -= 2;
    db.history.push({email, cnpj, razao_social:data.razao_social, date: new Date().toISOString()});
    writeDB(db);
    res.json({data, saldo:reg.saldo});
  } catch(e){
    res.json({error:"Erro na consulta"});
  }
});

// Histórico
app.get('/api/historico', (req,res)=>{
  const {email} = req.query;
  let db = readDB();
  let hist = db.history.filter(h=>h.email===email).slice(-30).reverse();
  res.json({historico:hist});
});

// Consulta processos Escavador (backend contorna CORS)
app.get('/api/processos', async (req,res)=>{
  const {cnpj} = req.query;
  const escavadorUrl = `https://www.escavador.com/cnpj/${Buffer.from(cnpj).toString('base64')}`;
  try {
    const r = await fetch(escavadorUrl);
    const html = await r.text();
    const ativos = [...html.matchAll(/class="processo-status[^"]*ativo[^"]*"[^>]*>Ativo<\/span>[\s\S]*?<span class="processo-numero">([^<]+)<\/span>/g)].map(m=>m[1]);
    const encerrados = [...html.matchAll(/class="processo-status[^"]*encerrado[^"]*"[^>]*>Encerrado<\/span>[\s\S]*?<span class="processo-numero">([^<]+)<\/span>/g)].map(m=>m[1]);
    res.json({ativos,encerrados, url: escavadorUrl});
  } catch(e){
    res.json({error:"Não foi possível buscar os processos", url: escavadorUrl});
  }
});

app.listen(PORT, ()=>console.log(`Backend rodando em http://localhost:${PORT}`));
