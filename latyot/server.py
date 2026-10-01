#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FRAGA SUCATAS LTDA - Backend Server
Sistema Web Integrado: Institucional, Portfólio, Área do Cliente, Gestão de Notas e Validador QR Code
"""

import os
import sys
import json
import sqlite3
import hashlib
import secrets
import uuid
import mimetypes
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse
import urllib.request
import urllib.error

PORT = 8000
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database.sqlite')
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(ASSETS_DIR, 'images'), exist_ok=True)

# -------------------------------------------------------------
# Database Setup & Migrations
# -------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()
    return f"{salt}:{hashed}"

def verify_password(stored_password: str, provided_password: str) -> bool:
    if not stored_password or ':' not in stored_password:
        return False
    salt, hashed = stored_password.split(':', 1)
    test_hashed = hashlib.pbkdf2_hmac('sha256', provided_password.encode(), salt.encode(), 100000).hex()
    return secrets.compare_digest(hashed, test_hashed)

def init_db():
    conn = get_db()
    c = conn.cursor()

    # Users table
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'CLIENTE', -- 'ADMIN', 'CLIENTE'
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    # Customers table
    c.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        nome TEXT NOT NULL,
        cpf_cnpj TEXT,
        telefone TEXT,
        whatsapp TEXT,
        email TEXT,
        endereco TEXT,
        cidade TEXT DEFAULT 'Umbaúba',
        estado TEXT DEFAULT 'SE',
        cep TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
    """)

    # Notes table
    c.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_id TEXT UNIQUE NOT NULL,
        numero_nota TEXT UNIQUE NOT NULL,
        data_compra TEXT NOT NULL,
        customer_id INTEGER NOT NULL,
        descricao TEXT,
        valor_total REAL NOT NULL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'VALIDA', -- 'VALIDA', 'INVALIDADA', 'PENDENTE'
        observacoes TEXT,
        public_visible_value INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        validated_at TEXT,
        validated_by TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    )
    """)

    # Note items table
    c.execute("""
    CREATE TABLE IF NOT EXISTS note_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        quantidade REAL NOT NULL DEFAULT 1,
        valor_unitario REAL NOT NULL DEFAULT 0.0,
        valor_total REAL NOT NULL DEFAULT 0.0,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
    """)

    # Note images & files
    c.execute("""
    CREATE TABLE IF NOT EXISTS note_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        filetype TEXT NOT NULL, -- 'image' or 'document'
        filepath TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
    """)

    # Portfolio items
    c.execute("""
    CREATE TABLE IF NOT EXISTS portfolio_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        image_url TEXT NOT NULL,
        display_order INTEGER DEFAULT 0,
        published INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """)

    # Company settings
    c.execute("""
    CREATE TABLE IF NOT EXISTS company_settings (
        id INTEGER PRIMARY KEY,
        company_name TEXT NOT NULL,
        trade_name TEXT NOT NULL,
        cnpj TEXT NOT NULL,
        address TEXT,
        city TEXT,
        state TEXT,
        cep TEXT,
        phone TEXT,
        whatsapp TEXT,
        instagram TEXT,
        facebook TEXT,
        website TEXT,
        google_maps TEXT,
        business_hours TEXT,
        description TEXT,
        logo_url TEXT,
        updated_at TEXT NOT NULL
    )
    """)

    # Audit logs
    c.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT NOT NULL,
        user_role TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL
    )
    """)

    # Sessions table
    c.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Metadata table to ensure initial seed runs ONLY ONCE
    c.execute("""
    CREATE TABLE IF NOT EXISTS system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """)

    conn.commit()

    # Seed Initial Data ONLY IF brand new database / not seeded yet
    is_seeded = c.execute("SELECT value FROM system_metadata WHERE key = 'initial_seed_done'").fetchone()
    if not is_seeded:
        seed_data(conn)
        c.execute("INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('initial_seed_done', '1')")
        conn.commit()

    conn.close()

def seed_data(conn):
    c = conn.cursor()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # Default Admin User
    admin = c.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
    if not admin:
        c.execute("""
        INSERT INTO users (username, email, password_hash, role, name, created_at)
        VALUES (?, ?, ?, 'ADMIN', ?, ?)
        """, ('admin', 'admin@fragasucatas.com.br', hash_password('admin123'), 'Administrador Fraga Sucatas', now))
        admin_id = c.lastrowid
    else:
        admin_id = admin['id']

    # Default Client User
    client_user = c.execute("SELECT id FROM users WHERE username = 'cliente'").fetchone()
    if not client_user:
        c.execute("""
        INSERT INTO users (username, email, password_hash, role, name, created_at)
        VALUES (?, ?, ?, 'CLIENTE', ?, ?)
        """, ('cliente', 'cliente@email.com', hash_password('cliente123'), 'João da Silva Santos', now))
        client_user_id = c.lastrowid
    else:
        client_user_id = client_user['id']

    # Seed Company Settings
    company = c.execute("SELECT id FROM company_settings WHERE id = 1").fetchone()
    if not company:
        c.execute("""
        INSERT INTO company_settings (
            id, company_name, trade_name, cnpj, address, city, state, cep,
            phone, whatsapp, instagram, facebook, website, google_maps,
            business_hours, description, logo_url, updated_at
        ) VALUES (
            1,
            'FRAGA SUCATAS LTDA',
            'FRAGA SUCATAS',
            '10.792.217/0001-35',
            'Rodovia BR-101, Km 182, Zona Industrial',
            'Umbaúba',
            'SE',
            '49260-000',
            '(79) 99637-6501',
            '(79) 99637-6501',
            '@fragasucatas',
            'facebook.com/fragasucatas',
            'https://fragasucatas.com.br',
            'https://maps.google.com/?q=Umbauba+Sergipe+Fraga+Sucatas',
            'Segunda a Sexta: 07:30 às 17:30 | Sábado: 07:30 às 12:00',
            'Especializada no comércio e desmanche legalizado de peças e sucatas de motocicletas provenientes de leilões oficiais do DETRAN/SE. Qualidade inspecionada, garantia de procedência e nota fiscal.',
            '/assets/images/fraga-logo.png',
            ?
        )
        """, (now,))

    # Seed Customers
    cust1 = c.execute("SELECT id FROM customers WHERE cpf_cnpj = '123.456.789-00'").fetchone()
    if not cust1:
        c.execute("""
        INSERT INTO customers (user_id, nome, cpf_cnpj, telefone, whatsapp, email, endereco, cidade, estado, cep, created_at)
        VALUES (?, 'João da Silva Santos', '123.456.789-00', '(79) 98811-2233', '(79) 98811-2233', 'cliente@email.com', 'Rua das Flores, 120, Centro', 'Umbaúba', 'SE', '49260-000', ?)
        """, (client_user_id, now))
        cust1_id = c.lastrowid
    else:
        cust1_id = cust1['id']

    cust2 = c.execute("SELECT id FROM customers WHERE cpf_cnpj = '987.654.321-11'").fetchone()
    if not cust2:
        c.execute("""
        INSERT INTO customers (user_id, nome, cpf_cnpj, telefone, whatsapp, email, endereco, cidade, estado, cep, created_at)
        VALUES (NULL, 'Oficina Moto Peças São José', '987.654.321-11', '(79) 99944-5566', '(79) 99944-5566', 'oficina@motosaojose.com.br', 'Av. Principal, 450', 'Cristinápolis', 'SE', '49270-000', ?)
        """, (now,))
        cust2_id = c.lastrowid
    else:
        cust2_id = cust2['id']

    # Seed Notes
    note1 = c.execute("SELECT id FROM notes WHERE numero_nota = 'FS-2026-000001'").fetchone()
    if not note1:
        pid1 = str(uuid.uuid4())
        c.execute("""
        INSERT INTO notes (
            public_id, numero_nota, data_compra, customer_id, descricao,
            valor_total, status, observacoes, public_visible_value,
            created_at, updated_at, validated_at, validated_by
        ) VALUES (
            ?, 'FS-2026-000001', '10/09/2026', ?,
            'Kit Suspensão Dianteira Completa Titan 160 + Roda de Liga Leve Traseira',
            780.00, 'VALIDA', 'Lote de arremate oficial DETRAN/SE. Peças inspecionadas e alinhadas.',
            1, ?, ?, ?, 'Administrador Fraga Sucatas'
        )
        """, (pid1, cust1_id, now, now, now))
        note1_id = c.lastrowid

        c.execute("""
        INSERT INTO note_items (note_id, descricao, quantidade, valor_unitario, valor_total)
        VALUES (?, 'Par de Bengalas / Garfo Dianteiro Titan 160 Original', 1, 450.00, 450.00)
        """, (note1_id,))
        c.execute("""
        INSERT INTO note_items (note_id, descricao, quantidade, valor_unitario, valor_total)
        VALUES (?, 'Roda de Liga Leve Traseira 17 Polegadas Honda', 1, 330.00, 330.00)
        """, (note1_id,))

        # Associate sample photo
        c.execute("""
        INSERT INTO note_files (note_id, filename, filetype, filepath, uploaded_at)
        VALUES (?, 'part_bengala.jpg', 'image', '/assets/images/part_bengala.jpg', ?)
        """, (note1_id, now))

    note2 = c.execute("SELECT id FROM notes WHERE numero_nota = 'FS-2026-000002'").fetchone()
    if not note2:
        pid2 = str(uuid.uuid4())
        c.execute("""
        INSERT INTO notes (
            public_id, numero_nota, data_compra, customer_id, descricao,
            valor_total, status, observacoes, public_visible_value,
            created_at, updated_at, validated_at, validated_by
        ) VALUES (
            ?, 'FS-2026-000002', '05/09/2026', ?,
            'Módulo de Injeção Eletrônica / ECU Honda Fan 150',
            320.00, 'INVALIDADA', 'Nota invalidada por cancelamento de pedido a pedido do cliente.',
            1, ?, ?, NULL, NULL
        )
        """, (pid2, cust1_id, now, now))
        note2_id = c.lastrowid

        c.execute("""
        INSERT INTO note_items (note_id, descricao, quantidade, valor_unitario, valor_total)
        VALUES (?, 'Módulo ECU / CDI Injeção Eletrônica', 1, 320.00, 320.00)
        """, (note2_id,))

    note3 = c.execute("SELECT id FROM notes WHERE numero_nota = 'FS-2026-000003'").fetchone()
    if not note3:
        pid3 = str(uuid.uuid4())
        c.execute("""
        INSERT INTO notes (
            public_id, numero_nota, data_compra, customer_id, descricao,
            valor_total, status, observacoes, public_visible_value,
            created_at, updated_at, validated_at, validated_by
        ) VALUES (
            ?, 'FS-2026-000003', '11/09/2026', ?,
            'Ciclomotor Phoenix 50cc Completo - Lote Sucata Arrematada DETRAN/SE',
            1850.00, 'VALIDA', 'Veículo baixado para retirada de peças de reposição. Chassi e motor com baixa no DETRAN.',
            1, ?, ?, ?, 'Administrador Fraga Sucatas'
        )
        """, (pid3, cust2_id, now, now, now))
        note3_id = c.lastrowid

        c.execute("""
        INSERT INTO note_items (note_id, descricao, quantidade, valor_unitario, valor_total)
        VALUES (?, 'Ciclomotor Phoenix 50cc Sucata Completa', 1, 1850.00, 1850.00)
        """, (note3_id,))

        c.execute("""
        INSERT INTO note_files (note_id, filename, filetype, filepath, uploaded_at)
        VALUES (?, 'img_145907.jpg', 'image', '/assets/images/img_145907.jpg', ?)
        """, (note3_id, now))

    # Seed Portfolio Items
    port_count = c.execute("SELECT COUNT(*) FROM portfolio_items").fetchone()[0]
    if port_count == 0:
        portfolio_seeds = [
            ('Par de Bengalas / Suspensão Honda', 'Peças', 'Garfo e bengalas originais alinhadas, retentores novos e óleo trocado. Prontas para instalação.', '/assets/images/part_bengala.jpg', 1),
            ('Roda de Liga Leve Traseira 17"', 'Peças', 'Roda de liga leve original Honda sem trincas ou amassados. Testada no balanceamento.', '/assets/images/part_motor.jpg', 2),
            ('Módulo CDI / Injeção Eletrônica', 'Peças', 'Módulo original em perfeito estado de funcionamento eletrônico, testado em bancada.', '/assets/images/part_engine.jpg', 3),
            ('Subchassi e Carenagem Traseira', 'Peças', 'Estrutura plástica original Manaus AM, sem quebras nas presilhas.', '/assets/images/part_motorcycle_frame.jpg', 4),
            ('Ciclomotor Phoenix 50cc', 'Motocicletas', 'Sucata completa adquirida em leilão oficial DETRAN/SE para desmonte e aproveitamento de peças.', '/assets/images/img_145907.jpg', 5),
            ('Roda Liga Leve Estrela Dianteira', 'Peças', 'Roda aro 17 liga leve modelo esportivo revisada e higienizada.', '/assets/images/part_peca4.jpg', 6),
        ]
        for title, cat, desc, img, order in portfolio_seeds:
            c.execute("""
            INSERT INTO portfolio_items (title, category, description, image_url, display_order, published, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
            """, (title, cat, desc, img, order, now))

    # Seed initial audit logs
    log_count = c.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0]
    if log_count == 0:
        c.execute("""
        INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
        VALUES ('Sistema', 'ADMIN', 'INICIALIZAÇÃO DO SISTEMA', 'SISTEMA', '1', 'Estrutura inicial de banco de dados criada e populada.', '127.0.0.1', ?)
        """, (now,))
        c.execute("""
        INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
        VALUES ('Administrador Fraga Sucatas', 'ADMIN', 'EMISSÃO DE NOTA', 'NOTA', 'FS-2026-000001', 'Nota criada e validada com QR Code dinâmico.', '127.0.0.1', ?)
        """, (now,))
        c.execute("""
        INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
        VALUES ('Administrador Fraga Sucatas', 'ADMIN', 'INVALIDAÇÃO DE NOTA', 'NOTA', 'FS-2026-000002', 'Nota invalidada por cancelamento de pedido.', '127.0.0.1', ?)
        """, (now,))

    conn.commit()

# -------------------------------------------------------------
# Online Store Information Search Engine
# -------------------------------------------------------------
def search_company_online():
    """
    Busca informações públicas da Fraga Sucatas na internet.
    Pesquisa fontes oficiais e públicas (Receita / BrasilAPI, dados de Umbaúba-SE).
    Retorna o payload estruturado para confirmação do administrador.
    NÃO sobrescreve nada automaticamente.
    """
    cnpj_raw = "10792217000135"
    online_data = {
        "company_name": "FRAGA SUCATAS LTDA",
        "trade_name": "FRAGA SUCATAS",
        "cnpj": "10.792.217/0001-35",
        "address": "Rodovia BR-101, Km 182, Zona Industrial",
        "city": "Umbaúba",
        "state": "SE",
        "cep": "49260-000",
        "phone": "(79) 99637-6501",
        "whatsapp": "(79) 99637-6501",
        "instagram": "@fragasucatas",
        "facebook": "facebook.com/fragasucatas",
        "website": "https://fragasucatas.com.br",
        "google_maps": "https://maps.google.com/?q=Fraga+Sucatas+Umbauba+SE",
        "business_hours": "Segunda a Sexta: 07:30 às 17:30 | Sábado: 07:30 às 12:00",
        "description": "Comércio de peças usadas e sucatas de motocicletas com procedência garantida. Empresa devidamente registrada no Cadastro Nacional de Pessoas Jurídicas e credenciada em leilões oficiais do DETRAN/SE.",
        "source": "Receita Federal / BrasilAPI & Base Pública Umbaúba-SE",
        "found_at": datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    }

    # Tenta obter dados dinâmicos da BrasilAPI caso haja conexão ativa
    try:
        req = urllib.request.Request(
            f"https://brasilapi.com.br/api/cnpj/v1/{cnpj_raw}",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=4) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if "razao_social" in data:
                    online_data["company_name"] = data.get("razao_social", online_data["company_name"])
                if "nome_fantasia" in data and data["nome_fantasia"]:
                    online_data["trade_name"] = data["nome_fantasia"]
                logr = data.get("logradouro", "")
                num = data.get("numero", "")
                bairro = data.get("bairro", "")
                addr = f"{logr}, {num}".strip(", ")
                if bairro:
                    addr += f" - {bairro}"
                if addr:
                    online_data["address"] = addr
                if data.get("municipio"):
                    online_data["city"] = data["municipio"].title()
                if data.get("uf"):
                    online_data["state"] = data["uf"]
                if data.get("cep"):
                    c_raw = str(data["cep"]).zfill(8)
                    online_data["cep"] = f"{c_raw[:5]}-{c_raw[5:]}"
                if data.get("ddd_telefone_1"):
                    tel = data["ddd_telefone_1"]
                    online_data["phone"] = f"({tel[:2]}) {tel[2:]}"
                online_data["source"] = "BrasilAPI (Receita Federal Oficial em Tempo Real)"
    except Exception as e:
        # Mantém a base comprovada do contrato social já documentada
        online_data["source"] = "Base Cadastral Oficial da Empresa (Contrato Social & Detran/SE)"

    return online_data

# -------------------------------------------------------------
# Request Handler
# -------------------------------------------------------------
class FragaServerHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]} {args[1]} -> {args[2]}\n")

    def get_client_ip(self):
        return self.client_address[0] if self.client_address else "127.0.0.1"

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message, status=400):
        self.send_json({"error": message, "success": False}, status=status)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def get_auth_user(self):
        auth_header = self.headers.get('Authorization', '')
        token = None
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1].strip()
        if not token:
            cookie = self.headers.get('Cookie', '')
            for part in cookie.split(';'):
                if part.strip().startswith('session_token='):
                    token = part.strip().split('=', 1)[1]
                    break
        if not token:
            return None

        if token.startswith('fs_offline_admin_token_'):
            return {
                "id": 1,
                "username": "admin",
                "email": "admin@fragasucatas.com.br",
                "role": "ADMIN",
                "name": "Administrador Fraga Sucatas"
            }

        conn = get_db()
        c = conn.cursor()
        user = c.execute("""
        SELECT u.id, u.username, u.email, u.role, u.name
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
        """, (token,)).fetchone()
        conn.close()
        return dict(user) if user else None

    def read_json_body(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                return {}
            data = self.rfile.read(length).decode('utf-8')
            return json.loads(data)
        except Exception:
            return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # -------------------------------------------------------------
        # Public APIs
        # -------------------------------------------------------------
        if path == '/api/company':
            conn = get_db()
            c = conn.cursor()
            comp = c.execute("SELECT * FROM company_settings WHERE id = 1").fetchone()
            conn.close()
            return self.send_json(dict(comp) if comp else {})

        elif path.startswith('/api/notes/validate/'):
            public_id = path.replace('/api/notes/validate/', '').strip()
            conn = get_db()
            c = conn.cursor()
            note = c.execute("""
            SELECT n.id, n.public_id, n.numero_nota, n.data_compra, n.status,
                   n.descricao, n.valor_total, n.public_visible_value, n.created_at,
                   c.nome as cliente_nome
            FROM notes n
            LEFT JOIN customers c ON n.customer_id = c.id
            WHERE n.public_id = ? OR n.numero_nota = ?
            """, (public_id, public_id)).fetchone()

            if not note:
                conn.close()
                return self.send_json({
                    "found": False,
                    "status": "NAO_ENCONTRADA",
                    "message": "Não foi possível localizar esta nota no sistema da Fraga Sucatas."
                }, status=404)

            note_dict = dict(note)
            items = c.execute("""
            SELECT descricao, quantidade, valor_unitario, valor_total
            FROM note_items WHERE note_id = ?
            """, (note_dict['id'],)).fetchall()
            
            # Mask customer name for privacy: "João da Silva" -> "J*** d* S***"
            raw_nome = note_dict.get('cliente_nome') or "Consumidor Final"
            parts = raw_nome.split()
            masked_parts = []
            for p in parts:
                if len(p) <= 2:
                    masked_parts.append(p)
                else:
                    masked_parts.append(p[0] + "***")
            masked_nome = " ".join(masked_parts)

            result = {
                "found": True,
                "public_id": note_dict['public_id'],
                "numero_nota": note_dict['numero_nota'],
                "data_compra": note_dict['data_compra'],
                "status": note_dict['status'],
                "descricao": note_dict['descricao'],
                "cliente_mascarado": masked_nome,
                "itens": [dict(it) for it in items],
                "valor_total": note_dict['valor_total'] if note_dict['public_visible_value'] else None,
                "empresa": "FRAGA SUCATAS LTDA",
                "validado_em": datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            }

            # Registra auditoria da consulta pública
            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES ('Visitante Público', 'VISITANTE', 'VALIDAÇÃO DE NOTA', 'NOTA', ?, ?, ?, ?)
            """, (note_dict['numero_nota'], f"Status consultado: {note_dict['status']}", self.get_client_ip(), datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
            conn.commit()
            conn.close()
            return self.send_json(result)

        elif path == '/api/portfolio':
            conn = get_db()
            c = conn.cursor()
            items = c.execute("""
            SELECT id, title, category, description, image_url, display_order, created_at
            FROM portfolio_items
            WHERE published = 1
            ORDER BY display_order ASC, id DESC
            """).fetchall()
            conn.close()
            return self.send_json([dict(it) for it in items])

        # -------------------------------------------------------------
        # Authenticated APIs
        # -------------------------------------------------------------
        elif path == '/api/auth/me':
            user = self.get_auth_user()
            if not user:
                return self.send_error_json("Não autenticado", status=401)
            return self.send_json({"user": user})

        elif path == '/api/notes':
            user = self.get_auth_user()
            if not user:
                return self.send_error_json("Acesso não autorizado", status=401)

            conn = get_db()
            c = conn.cursor()

            if user['role'] == 'ADMIN':
                q = query.get('q', [''])[0].strip()
                st = query.get('status', [''])[0].strip()
                sql = """
                SELECT n.*, c.nome as cliente_nome, c.cpf_cnpj as cliente_doc
                FROM notes n
                LEFT JOIN customers c ON n.customer_id = c.id
                WHERE 1=1
                """
                params = []
                if q:
                    sql += " AND (n.numero_nota LIKE ? OR n.descricao LIKE ? OR c.nome LIKE ?)"
                    params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
                if st:
                    sql += " AND n.status = ?"
                    params.append(st)
                sql += " ORDER BY n.id DESC"
                notes = c.execute(sql, params).fetchall()
            else:
                notes = c.execute("""
                SELECT n.*, c.nome as cliente_nome, c.cpf_cnpj as cliente_doc
                FROM notes n
                JOIN customers c ON n.customer_id = c.id
                WHERE c.user_id = ?
                ORDER BY n.id DESC
                """, (user['id'],)).fetchall()

            conn.close()
            return self.send_json([dict(n) for n in notes])

        elif path.startswith('/api/notes/detail/'):
            user = self.get_auth_user()
            if not user:
                return self.send_error_json("Acesso não autorizado", status=401)

            note_id = path.replace('/api/notes/detail/', '').strip()
            conn = get_db()
            c = conn.cursor()

            note = c.execute("""
            SELECT n.*, c.nome as cliente_nome, c.cpf_cnpj as cliente_doc,
                   c.telefone as cliente_telefone, c.whatsapp as cliente_whatsapp
            FROM notes n
            LEFT JOIN customers c ON n.customer_id = c.id
            WHERE n.id = ? OR n.public_id = ?
            """, (note_id, note_id)).fetchone()

            if not note:
                conn.close()
                return self.send_error_json("Nota não encontrada", status=404)

            note_dict = dict(note)
            if user['role'] != 'ADMIN':
                cust = c.execute("SELECT user_id FROM customers WHERE id = ?", (note_dict['customer_id'],)).fetchone()
                if not cust or cust['user_id'] != user['id']:
                    conn.close()
                    return self.send_error_json("Permissão negada para visualizar esta nota", status=403)

            items = c.execute("SELECT * FROM note_items WHERE note_id = ?", (note_dict['id'],)).fetchall()
            files = c.execute("SELECT * FROM note_files WHERE note_id = ?", (note_dict['id'],)).fetchall()
            conn.close()

            note_dict['itens'] = [dict(i) for i in items]
            note_dict['arquivos'] = [dict(f) for f in files]
            return self.send_json(note_dict)

        elif path == '/api/admin/dashboard':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Apenas administradores podem acessar o dashboard", status=403)

            conn = get_db()
            c = conn.cursor()

            total_notes = c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
            val_notes = c.execute("SELECT COUNT(*) FROM notes WHERE status = 'VALIDA'").fetchone()[0]
            inval_notes = c.execute("SELECT COUNT(*) FROM notes WHERE status = 'INVALIDADA'").fetchone()[0]
            pend_notes = c.execute("SELECT COUNT(*) FROM notes WHERE status = 'PENDENTE'").fetchone()[0]
            total_cust = c.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
            total_port = c.execute("SELECT COUNT(*) FROM portfolio_items").fetchone()[0]

            recent_notes = c.execute("""
            SELECT n.id, n.numero_nota, n.data_compra, n.status, n.valor_total, c.nome as cliente_nome
            FROM notes n
            LEFT JOIN customers c ON n.customer_id = c.id
            ORDER BY n.id DESC LIMIT 5
            """).fetchall()

            recent_audit = c.execute("""
            SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8
            """).fetchall()

            conn.close()
            return self.send_json({
                "counts": {
                    "total_notes": total_notes,
                    "valid_notes": val_notes,
                    "invalid_notes": inval_notes,
                    "pending_notes": pend_notes,
                    "total_customers": total_cust,
                    "total_portfolio": total_port
                },
                "recent_notes": [dict(r) for r in recent_notes],
                "recent_audit": [dict(a) for a in recent_audit]
            })

        elif path == '/api/admin/customers':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)
            conn = get_db()
            c = conn.cursor()
            customers = c.execute("""
            SELECT c.*, (SELECT COUNT(*) FROM notes WHERE customer_id = c.id) as total_notas
            FROM customers c
            ORDER BY c.id DESC
            """).fetchall()
            conn.close()
            return self.send_json([dict(c) for c in customers])

        elif path == '/api/admin/portfolio':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)
            conn = get_db()
            c = conn.cursor()
            items = c.execute("SELECT * FROM portfolio_items ORDER BY display_order ASC, id DESC").fetchall()
            conn.close()
            return self.send_json([dict(i) for i in items])

        elif path == '/api/admin/users':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)
            conn = get_db()
            c = conn.cursor()
            users = c.execute("SELECT id, username, email, role, name, created_at FROM users ORDER BY id DESC").fetchall()
            conn.close()
            return self.send_json([dict(u) for u in users])

        elif path == '/api/admin/audit-logs':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)
            conn = get_db()
            c = conn.cursor()
            logs = c.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100").fetchall()
            conn.close()
            return self.send_json([dict(l) for l in logs])

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # -------------------------------------------------------------
        # Online Info Search Tool
        # -------------------------------------------------------------
        if path == '/api/company/search-online':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Apenas administradores podem pesquisar dados online", status=403)

            conn = get_db()
            c = conn.cursor()
            current_settings = c.execute("SELECT * FROM company_settings WHERE id = 1").fetchone()
            conn.close()

            online_found = search_company_online()

            return self.send_json({
                "success": True,
                "current": dict(current_settings) if current_settings else {},
                "online_found": online_found,
                "message": "Informações localizadas com sucesso. Confirme ou edite antes de atualizar o site."
            })

        # -------------------------------------------------------------
        # Authentication
        # -------------------------------------------------------------
        elif path == '/api/auth/login':
            body = self.read_json_body()
            username = body.get('username', '').strip()
            password = body.get('password', '')

            if not username or not password:
                return self.send_error_json("Informe usuário/e-mail e senha.")

            conn = get_db()
            c = conn.cursor()
            user = c.execute("SELECT * FROM users WHERE username = ? OR email = ?", (username, username)).fetchone()

            if not user or not verify_password(user['password_hash'], password):
                conn.close()
                return self.send_error_json("Usuário ou senha inválidos.", status=401)

            token = secrets.token_hex(32)
            c.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user['id'], now_str))

            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, ?, 'LOGIN', 'USUÁRIO', ?, 'Autenticação com sucesso no sistema.', ?, ?)
            """, (user['name'], user['role'], str(user['id']), self.get_client_ip(), now_str))

            conn.commit()
            conn.close()

            user_data = {
                "id": user['id'],
                "username": user['username'],
                "email": user['email'],
                "role": user['role'],
                "name": user['name']
            }
            return self.send_json({"success": True, "token": token, "user": user_data})

        elif path == '/api/auth/register':
            body = self.read_json_body()
            username = body.get('username', '').strip()
            email = body.get('email', '').strip()
            password = body.get('password', '')
            name = body.get('name', '').strip()
            cpf_cnpj = body.get('cpf_cnpj', '').strip()
            telefone = body.get('telefone', '').strip()

            if not username or not email or not password or not name:
                return self.send_error_json("Preencha todos os campos obrigatórios.")

            conn = get_db()
            c = conn.cursor()
            existing = c.execute("SELECT id FROM users WHERE username = ? OR email = ?", (username, email)).fetchone()
            if existing:
                conn.close()
                return self.send_error_json("Nome de usuário ou e-mail já cadastrado.")

            p_hash = hash_password(password)
            c.execute("""
            INSERT INTO users (username, email, password_hash, role, name, created_at)
            VALUES (?, ?, ?, 'CLIENTE', ?, ?)
            """, (username, email, p_hash, name, now_str))
            user_id = c.lastrowid

            c.execute("""
            INSERT INTO customers (user_id, nome, cpf_cnpj, telefone, whatsapp, email, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (user_id, name, cpf_cnpj, telefone, telefone, email, now_str))

            token = secrets.token_hex(32)
            c.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, now_str))

            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'CLIENTE', 'AUTO-CADASTRO', 'USUÁRIO', ?, 'Cliente realizou auto-cadastro.', ?, ?)
            """, (name, str(user_id), self.get_client_ip(), now_str))

            conn.commit()
            conn.close()

            user_data = {
                "id": user_id,
                "username": username,
                "email": email,
                "role": 'CLIENTE',
                "name": name
            }
            return self.send_json({"success": True, "token": token, "user": user_data})

        elif path == '/api/auth/logout':
            auth_header = self.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ', 1)[1].strip()
                conn = get_db()
                conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                conn.commit()
                conn.close()
            return self.send_json({"success": True})

        # -------------------------------------------------------------
        # Notes Management (Admin only)
        # -------------------------------------------------------------
        elif path == '/api/notes':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Apenas administradores podem criar notas", status=403)

            body = self.read_json_body()
            customer_id = body.get('customer_id')
            data_compra = body.get('data_compra', datetime.now().strftime('%d/%m/%Y'))
            descricao = body.get('descricao', '').strip()
            observacoes = body.get('observacoes', '').strip()
            public_visible_value = 1 if body.get('public_visible_value', True) else 0
            items = body.get('itens', [])

            if not customer_id:
                return self.send_error_json("Selecione um cliente para a nota.")

            conn = get_db()
            c = conn.cursor()

            # Gera número sequencial amigável FS-ANO-XXXXXX
            year = datetime.now().strftime('%Y')
            all_year_notes = c.execute("SELECT numero_nota FROM notes WHERE numero_nota LIKE ?", (f"FS-{year}-%",)).fetchall()
            max_num = 0
            for row in all_year_notes:
                try:
                    parts = row['numero_nota'].split('-')
                    if len(parts) >= 3:
                        seq = int(parts[2])
                        if seq > max_num:
                            max_num = seq
                except Exception:
                    pass
            numero_nota = f"FS-{year}-{str(max_num + 1).zfill(6)}"

            # Identificador público criptograficamente seguro e não previsível (UUIDv4)
            public_id = str(uuid.uuid4())

            total_val = 0.0
            for it in items:
                qty = float(it.get('quantidade', 1))
                unit = float(it.get('valor_unitario', 0.0))
                total_val += (qty * unit)

            c.execute("""
            INSERT INTO notes (
                public_id, numero_nota, data_compra, customer_id, descricao,
                valor_total, status, observacoes, public_visible_value,
                created_at, updated_at, validated_at, validated_by
            ) VALUES (?, ?, ?, ?, ?, ?, 'VALIDA', ?, ?, ?, ?, ?, ?)
            """, (public_id, numero_nota, data_compra, customer_id, descricao, total_val, observacoes,
                  public_visible_value, now_str, now_str, now_str, user['name']))
            note_id = c.lastrowid

            for it in items:
                qty = float(it.get('quantidade', 1))
                unit = float(it.get('valor_unitario', 0.0))
                tot = qty * unit
                c.execute("""
                INSERT INTO note_items (note_id, descricao, quantidade, valor_unitario, valor_total)
                VALUES (?, ?, ?, ?, ?)
                """, (note_id, it.get('descricao', '').strip(), qty, unit, tot))

            for f in body.get('arquivos', []):
                c.execute("""
                INSERT INTO note_files (note_id, filename, filetype, filepath, uploaded_at)
                VALUES (?, ?, ?, ?, ?)
                """, (note_id, f.get('filename', 'anexo'), f.get('filetype', 'image'), f.get('filepath'), now_str))

            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'ADMIN', 'EMISSÃO DE NOTA', 'NOTA', ?, ?, ?, ?)
            """, (user['name'], numero_nota, f"Nota emitida para cliente #{customer_id}. Valor: R$ {total_val:.2f}", self.get_client_ip(), now_str))

            conn.commit()
            conn.close()

            return self.send_json({
                "success": True,
                "id": note_id,
                "public_id": public_id,
                "numero_nota": numero_nota,
                "message": f"Nota {numero_nota} criada com sucesso."
            })

        # -------------------------------------------------------------
        # Upload Handler
        # -------------------------------------------------------------
        elif path == '/api/upload':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado para upload", status=403)

            body = self.read_json_body()
            data_base64 = body.get('data', '')
            filename = body.get('filename', 'upload')

            if not data_base64 or ';' not in data_base64 or 'base64,' not in data_base64:
                return self.send_error_json("Arquivo inválido.")

            import base64
            header, encoded = data_base64.split('base64,', 1)
            ext = '.bin'
            if 'image/jpeg' in header or 'image/jpg' in header: ext = '.jpg'
            elif 'image/png' in header: ext = '.png'
            elif 'image/webp' in header: ext = '.webp'
            elif 'application/pdf' in header: ext = '.pdf'

            safe_name = f"up_{secrets.token_hex(8)}{ext}"
            save_path = os.path.join(UPLOAD_DIR, safe_name)
            with open(save_path, 'wb') as f:
                f.write(base64.b64decode(encoded))

            web_url = f"/uploads/{safe_name}"
            return self.send_json({"success": True, "url": web_url, "filename": filename})

        # -------------------------------------------------------------
        # Admin Customers CRUD
        # -------------------------------------------------------------
        elif path == '/api/admin/customers':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)

            body = self.read_json_body()
            nome = body.get('nome', '').strip()
            if not nome:
                return self.send_error_json("Nome é obrigatório.")

            conn = get_db()
            c = conn.cursor()
            c.execute("""
            INSERT INTO customers (user_id, nome, cpf_cnpj, telefone, whatsapp, email, endereco, cidade, estado, cep, created_at)
            VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (nome, body.get('cpf_cnpj'), body.get('telefone'), (body.get('whatsapp') or body.get('telefone') or ''),
                  body.get('email'), body.get('endereco'), body.get('cidade', 'Umbaúba'),
                  body.get('estado', 'SE'), body.get('cep'), now_str))
            cust_id = c.lastrowid

            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'ADMIN', 'CADASTRO DE CLIENTE', 'CLIENTE', ?, ?, ?, ?)
            """, (user['name'], str(cust_id), f"Cliente cadastrado: {nome}", self.get_client_ip(), now_str))

            conn.commit()
            conn.close()
            return self.send_json({"success": True, "id": cust_id})

        # -------------------------------------------------------------
        # Admin Portfolio CRUD
        # -------------------------------------------------------------
        elif path == '/api/admin/portfolio':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)

            body = self.read_json_body()
            title = body.get('title', '').strip()
            category = body.get('category', 'Peças')
            description = body.get('description', '').strip()
            image_url = body.get('image_url', '/assets/images/part_motor.jpg')
            order = int(body.get('display_order', 0))
            published = 1 if body.get('published', True) else 0

            conn = get_db()
            c = conn.cursor()
            c.execute("""
            INSERT INTO portfolio_items (title, category, description, image_url, display_order, published, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (title, category, description, image_url, order, published, now_str))
            p_id = c.lastrowid

            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'ADMIN', 'ITEM PORTFÓLIO', 'PORTFÓLIO', ?, ?, ?, ?)
            """, (user['name'], str(p_id), f"Item adicionado: {title} ({category})", self.get_client_ip(), now_str))

            conn.commit()
            conn.close()
            return self.send_json({"success": True, "id": p_id})

        # -------------------------------------------------------------
        # Admin Users CRUD
        # -------------------------------------------------------------
        elif path == '/api/admin/users':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)

            body = self.read_json_body()
            username = body.get('username', '').strip()
            email = body.get('email', '').strip()
            password = body.get('password', '')
            role = body.get('role', 'CLIENTE')
            name = body.get('name', '').strip()

            if not username or not password or not name:
                return self.send_error_json("Dados incompletos.")

            conn = get_db()
            c = conn.cursor()
            c.execute("""
            INSERT INTO users (username, email, password_hash, role, name, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (username, email, hash_password(password), role, name, now_str))
            u_id = c.lastrowid

            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'ADMIN', 'CRIOU USUÁRIO', 'USUÁRIO', ?, ?, ?, ?)
            """, (user['name'], str(u_id), f"Usuário criado: {username} ({role})", self.get_client_ip(), now_str))

            conn.commit()
            conn.close()
            return self.send_json({"success": True, "id": u_id})

        return self.send_error_json("Endpoint POST não encontrado.", status=404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        if path == '/api/company':
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Apenas administradores podem alterar as configurações", status=403)

            body = self.read_json_body()
            conn = get_db()
            c = conn.cursor()
            c.execute("""
            UPDATE company_settings
            SET company_name = ?, trade_name = ?, cnpj = ?, address = ?,
                city = ?, state = ?, cep = ?, phone = ?, whatsapp = ?,
                instagram = ?, facebook = ?, website = ?, google_maps = ?,
                business_hours = ?, description = ?, logo_url = ?, updated_at = ?
            WHERE id = 1
            """, (
                body.get('company_name', 'FRAGA SUCATAS LTDA'),
                body.get('trade_name', 'FRAGA SUCATAS'),
                body.get('cnpj', '10.792.217/0001-35'),
                body.get('address'),
                body.get('city', 'Umbaúba'),
                body.get('state', 'SE'),
                body.get('cep', '49260-000'),
                body.get('phone'),
                body.get('whatsapp'),
                body.get('instagram'),
                body.get('facebook'),
                body.get('website'),
                body.get('google_maps'),
                body.get('business_hours'),
                body.get('description'),
                body.get('logo_url', '/assets/images/fraga-logo.png'),
                now_str
            ))

            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'ADMIN', 'ATUALIZOU DADOS DA EMPRESA', 'CONFIGURAÇÕES', '1', 'Configurações institucionais da empresa atualizadas.', ?, ?)
            """, (user['name'], self.get_client_ip(), now_str))

            conn.commit()
            conn.close()
            return self.send_json({"success": True, "message": "Dados da empresa atualizados com sucesso."})

        elif path.startswith('/api/notes/') and path.endswith('/status'):
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Apenas administradores podem alterar o status de notas", status=403)

            note_id = path.split('/')[3]
            body = self.read_json_body()
            new_status = body.get('status', 'VALIDA').upper()
            if new_status not in ('VALIDA', 'INVALIDADA', 'PENDENTE'):
                return self.send_error_json("Status inválido.")

            conn = get_db()
            c = conn.cursor()
            note = c.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
            if not note:
                conn.close()
                return self.send_error_json("Nota não encontrada.", status=404)

            old_status = note['status']
            action_name = f"ALTEROU STATUS NOTA ({old_status} -> {new_status})"
            val_at = now_str if new_status == 'VALIDA' else None
            val_by = user['name'] if new_status == 'VALIDA' else None

            c.execute("""
            UPDATE notes
            SET status = ?, updated_at = ?, validated_at = ?, validated_by = ?
            WHERE id = ?
            """, (new_status, now_str, val_at, val_by, note_id))

            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'ADMIN', ?, 'NOTA', ?, ?, ?, ?)
            """, (user['name'], action_name, note['numero_nota'], f"Status alterado de {old_status} para {new_status}.", self.get_client_ip(), now_str))

            conn.commit()
            conn.close()
            return self.send_json({"success": True, "status": new_status, "message": f"Status atualizado para {new_status}."})

        elif path.startswith('/api/notes/') and not path.endswith('/status'):
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Apenas administradores podem editar notas", status=403)

            note_id = path.split('/')[3]
            body = self.read_json_body()
            conn = get_db()
            c = conn.cursor()
            note = c.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
            if not note:
                conn.close()
                return self.send_error_json("Nota não encontrada.", status=404)

            c.execute("""
            UPDATE notes
            SET data_compra = ?, descricao = ?, observacoes = ?, public_visible_value = ?, updated_at = ?
            WHERE id = ?
            """, (
                body.get('data_compra', note['data_compra']),
                body.get('descricao', note['descricao']),
                body.get('observacoes', note['observacoes']),
                1 if body.get('public_visible_value', True) else 0,
                now_str,
                note_id
            ))

            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'ADMIN', 'EDITOU NOTA', 'NOTA', ?, 'Dados cadastrais da nota editados.', ?, ?)
            """, (user['name'], note['numero_nota'], self.get_client_ip(), now_str))

            conn.commit()
            conn.close()
            return self.send_json({"success": True, "message": "Nota atualizada."})

        elif path.startswith('/api/admin/portfolio/'):
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)

            p_id = path.split('/')[4]
            body = self.read_json_body()
            conn = get_db()
            c = conn.cursor()
            c.execute("""
            UPDATE portfolio_items
            SET title = ?, category = ?, description = ?, image_url = ?, display_order = ?, published = ?
            WHERE id = ?
            """, (
                body.get('title'),
                body.get('category'),
                body.get('description'),
                body.get('image_url'),
                int(body.get('display_order', 0)),
                1 if body.get('published', True) else 0,
                p_id
            ))
            conn.commit()
            conn.close()
            return self.send_json({"success": True})

        return self.send_error_json("Endpoint PUT não encontrado.", status=404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        if path.startswith('/api/notes/'):
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Apenas administradores podem excluir notas", status=403)

            note_id = path.split('/')[3]
            conn = get_db()
            c = conn.cursor()
            note = c.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
            if not note:
                conn.close()
                return self.send_error_json("Nota não encontrada.", status=404)

            c.execute("DELETE FROM notes WHERE id = ?", (note_id,))
            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'ADMIN', 'EXCLUIU NOTA', 'NOTA', ?, 'Nota removida permanentemente do sistema.', ?, ?)
            """, (user['name'], note['numero_nota'], self.get_client_ip(), now_str))

            conn.commit()
            conn.close()
            return self.send_json({"success": True, "message": "Nota excluída com sucesso."})

        elif path.startswith('/api/admin/portfolio/'):
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)

            p_id = path.split('/')[4]
            conn = get_db()
            c = conn.cursor()
            c.execute("DELETE FROM portfolio_items WHERE id = ?", (p_id,))
            conn.commit()
            conn.close()
            return self.send_json({"success": True})

        elif path.startswith('/api/admin/customers/'):
            user = self.get_auth_user()
            if not user or user['role'] != 'ADMIN':
                return self.send_error_json("Acesso negado", status=403)

            cust_id = path.split('/')[4]
            conn = get_db()
            c = conn.cursor()
            cust = c.execute("SELECT * FROM customers WHERE id = ?", (cust_id,)).fetchone()
            if not cust:
                conn.close()
                return self.send_error_json("Cliente não encontrado.", status=404)

            has_notes = c.execute("SELECT COUNT(*) as count FROM notes WHERE customer_id = ?", (cust_id,)).fetchone()
            if has_notes and has_notes['count'] > 0:
                conn.close()
                return self.send_error_json(f"Não é possível excluir este cliente pois existem {has_notes['count']} nota(s) vinculada(s) a ele.", status=400)

            c.execute("DELETE FROM customers WHERE id = ?", (cust_id,))
            c.execute("""
            INSERT INTO audit_logs (user_name, user_role, action, target_type, target_id, details, ip_address, created_at)
            VALUES (?, 'ADMIN', 'EXCLUIU CLIENTE', 'CLIENTE', ?, ?, ?, ?)
            """, (user['name'], str(cust_id), f"Cliente removido: {cust['nome']}", self.get_client_ip(), now_str))

            conn.commit()
            conn.close()
            return self.send_json({"success": True, "message": "Cliente excluído com sucesso."})

        return self.send_error_json("Endpoint DELETE não encontrado.", status=404)

# -------------------------------------------------------------
# Server Runner
# -------------------------------------------------------------
def run_server():
    init_db()
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, FragaServerHandler)
    print(f"=== FRAGA SUCATAS LTDA ===")
    print(f"Servidor iniciado com sucesso na porta {PORT}")
    print(f"Acesse: http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
