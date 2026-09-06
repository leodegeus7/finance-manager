#!/usr/bin/env python3
# ============================================================
# Migração do histórico da FAZENDA (planilha Sicredi) -> SQL seed
#
# Lê as abas CONTA + CARTÃO + INVESTIMENTOS XP do controle manual do
# usuário (`SICREDI-transa.xlsx`) e gera um seed SQL idempotente para o
# ledger `user_id='fazenda'`: contas, cartões, categorias, transações e
# histórico de saldos (checking + investimentos XP pessoal/profissional).
#
# Uso:
#   python3 scripts/parse_fazenda_xlsx.py [caminho.xlsx] [saida.sql]
# Defaults:
#   xlsx  = ~/Downloads/SICREDI-transa.xlsx
#   saída = supabase/migrations/20260708_fazenda_seed.sql
#
# Sem dependências externas (stdlib: zipfile + re). Rode o SQL gerado no
# SQL Editor do Supabase (idempotente por (external_id, source) / on conflict).
#
# Regras de mapeamento (ver CLAUDE.md §"ledger Fazenda"):
#  - Mês vem da DATA (serial), não da coluna MÊS (que é mista/ruidosa).
#  - context = 'personal' quando a categoria é "Particular"; senão 'professional'.
#  - Overrides de tipo (evitam inflar o fluxo de caixa):
#      * categoria "Sicredi Aplicação Automática" -> investment_* (fora do fluxo);
#      * descrição com "fatura" na CONTA -> credit_card_payment (não duplica com CARTÃO).
#  - CARTÃO: compra -> credit_card_purchase; estorno (valor<0) -> income (neta o total).
#  - signed_amount = +amount (receita) / -amount (despesa).
# ============================================================

import os, re, sys, html, zipfile, datetime, unicodedata

XLSX = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/Downloads/SICREDI-transa.xlsx')
OUT  = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(__file__), '..', 'supabase', 'migrations', '20260708_fazenda_seed.sql')

APLIC_CAT   = 'Sicredi Aplicação Automática'
FATURA_RE   = re.compile(r'fatura', re.I)

# ── XLSX parsing (stdlib) ─────────────────────────────────────
def load_workbook(path):
    z = zipfile.ZipFile(path)
    ss = []
    sx = z.read('xl/sharedStrings.xml').decode('utf-8')
    for m in re.finditer(r'<si>(.*?)</si>', sx, re.S):
        ss.append(html.unescape(''.join(re.findall(r'<t[^>]*>(.*?)</t>', m.group(1), re.S))))
    # map sheet name -> worksheet target
    wb = z.read('xl/workbook.xml').decode('utf-8')
    rels = z.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    rid_to_target = {m.group(1): m.group(2)
                     for m in re.finditer(r'<Relationship [^>]*Id="([^"]*)"[^>]*Target="([^"]*)"', rels)}
    name_to_file = {}
    for m in re.finditer(r'<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"', wb):
        tgt = rid_to_target.get(m.group(2), '')
        if tgt:
            name_to_file[m.group(1)] = 'xl/' + tgt.lstrip('/').replace('xl/', '')
    return z, ss, name_to_file

def col_idx(ref):
    n = 0
    for ch in ref:
        n = n * 26 + (ord(ch) - 64)
    return n - 1

def rows_of(z, ss, fname):
    xml = z.read(fname).decode('utf-8')
    for rn, body in re.findall(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', xml, re.S):
        cells = {}
        for cm in re.finditer(r'<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]*)")?[^>]*>(.*?)</c>', body, re.S):
            vm = re.search(r'<v>(.*?)</v>', cm.group(3), re.S)
            val = ''
            if vm:
                val = ss[int(vm.group(1))] if cm.group(2) == 's' else vm.group(1)
            cells[col_idx(cm.group(1))] = val.strip()
        yield int(rn), cells

# ── helpers ───────────────────────────────────────────────────
EPOCH = datetime.date(1899, 12, 30)
def serial_to_date(s):
    try:
        return EPOCH + datetime.timedelta(days=int(float(s)))
    except (ValueError, TypeError):
        return None

def to_num(s):
    try:
        return float(s)
    except (ValueError, TypeError):
        return None

def month_first(d):
    return f'{d.year:04d}-{d.month:02d}-01'

def parse_mes(val, fallback_date):
    """Competência do usuário (coluna MÊS, formato misto): 'M/YYYY', serial de
    data, ou vazio -> fallback pro mês da data da transação. Casar com a MÊS do
    usuário faz os totais baterem exatamente com os fechamentos (abas DADOS)."""
    val = (val or '').strip()
    if '/' in val:
        try:
            mm, yy = val.split('/')
            return f'{int(yy):04d}-{int(mm):02d}-01'
        except ValueError:
            pass
    d = serial_to_date(val)
    if d:
        return month_first(d)
    return month_first(fallback_date)

def slugify(name):
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s or 'x'

def q(s):
    if s is None:
        return 'null'
    return "'" + str(s).replace("'", "''") + "'"

# ── build category registry (id + income/expense prefix) ──────
class Categories:
    def __init__(self):
        self.by_name = {}          # name -> {'inc':0,'exp':0,'slug':...}
        self.order = []

    def touch(self, name):
        if not name:
            return
        if name not in self.by_name:
            self.by_name[name] = {'inc': 0, 'exp': 0}
            self.order.append(name)

    def tally(self, name, direction):
        if not name:
            return
        self.touch(name)
        self.by_name[name]['inc' if direction == 'income' else 'exp'] += 1

    def finalize(self):
        used = set()
        self.id_of = {}
        for name in self.order:
            info = self.by_name[name]
            income = info['inc'] > info['exp']
            base = ('inc-faz-' if income else 'faz-cat-') + slugify(name)
            cid = base
            i = 2
            while cid in used:
                cid = f'{base}-{i}'; i += 1
            used.add(cid)
            self.id_of[name] = cid

    def cid(self, name):
        return self.id_of.get(name) if name else None

# ── main ──────────────────────────────────────────────────────
def main():
    z, ss, sheets = load_workbook(XLSX)
    cats = Categories()
    tx_rows = []            # dicts to emit
    balances = {}           # (account_id, month) -> balance (checking month-end)

    # -- CONTA --
    conta_file = sheets['CONTA']
    for rn, c in rows_of(z, ss, conta_file):
        if rn == 1:
            continue
        date = serial_to_date(c.get(1))
        valor = to_num(c.get(5))
        banco = c.get(10, '')
        if date is None or valor is None or not banco:
            continue
        desc = c.get(2, '') or '(sem descrição)'
        catname = c.get(7, '') or ''
        acc = 'faz-acc-sicredi' if 'sicredi' in banco.lower() else \
              'faz-acc-itau' if 'ita' in banco.lower() else None
        if acc is None:
            continue

        # type overrides
        if catname == APLIC_CAT:
            typ = 'investment_contribution' if valor < 0 else 'investment_withdrawal'
        elif FATURA_RE.search(desc):
            typ = 'credit_card_payment'
        else:
            typ = 'income' if valor > 0 else 'expense'

        direction = 'income' if valor > 0 else 'expense'
        if typ in ('income', 'expense'):
            cats.tally(catname, direction)
        else:
            cats.touch(catname)

        month = parse_mes(c.get(9, ''), date)   # competência = coluna MÊS do usuário
        tx_rows.append(dict(
            source='fazenda_xlsx_conta', external_id=f'conta-{rn}',
            date=date.isoformat(), competency_month=month, statement_month=None,
            amount=abs(valor), signed_amount=(abs(valor) if direction == 'income' else -abs(valor)),
            direction=direction, type=typ, description=desc, catname=catname,
            context=('personal' if catname.strip().lower() == 'particular' else 'professional'),
            account_id=acc, credit_card_id=None,
        ))
        # month-end checking balance: keep the SALDO of the latest date within the
        # CALENDAR month (não a competência), pois é o saldo real de fim de mês.
        saldo = to_num(c.get(6))
        if saldo is not None:
            key = (acc, month_first(date))
            prev = balances.get(key)
            if prev is None or date >= prev[0]:
                balances[key] = (date, saldo)

    # -- CARTÃO --
    cartao_file = sheets['CARTÃO']
    for rn, c in rows_of(z, ss, cartao_file):
        if rn == 1:
            continue
        date = serial_to_date(c.get(1))
        valor = to_num(c.get(5))
        if date is None or valor is None:
            continue
        desc = c.get(2, '') or '(sem descrição)'
        catname = c.get(6, '') or ''
        cardname = (c.get(10, '') or '').lower()
        card = 'faz-card-black' if 'black' in cardname else 'faz-card-visa'  # blank -> visa (cartão atual)
        fatura = serial_to_date(c.get(3))
        stmt = month_first(fatura) if fatura else month_first(date)

        if valor >= 0:
            typ, direction = 'credit_card_purchase', 'expense'
        else:
            typ, direction = 'income', 'income'   # estorno neta o total
        cats.tally(catname, direction)

        tx_rows.append(dict(
            source='fazenda_xlsx_cartao', external_id=f'cartao-{rn}',
            date=date.isoformat(), competency_month=parse_mes(c.get(8, ''), date), statement_month=stmt,
            amount=abs(valor), signed_amount=(abs(valor) if direction == 'income' else -abs(valor)),
            direction=direction, type=typ, description=desc, catname=catname,
            context=('personal' if catname.strip().lower() == 'particular' else 'professional'),
            account_id=None, credit_card_id=card,
        ))

    cats.finalize()

    # -- INVESTIMENTOS XP: pessoal / profissional month-end --
    xp_balances = []   # (account_id, month, balance)
    for rn, c in rows_of(z, ss, sheets['INVESTIMENTOS XP']):
        if rn == 1:
            continue
        date = serial_to_date(c.get(0))
        pessoal = to_num(c.get(1))
        profis = to_num(c.get(2))
        if date is None:
            continue
        m = month_first(date)
        if pessoal is not None:
            xp_balances.append(('faz-acc-xp-pessoal', m, pessoal))
        if profis is not None:
            xp_balances.append(('faz-acc-xp-profissional', m, profis))

    write_sql(tx_rows, cats, balances, xp_balances)
    write_json(tx_rows, cats, balances, xp_balances)
    # summary to stderr
    inc = sum(1 for t in tx_rows if t['type'] == 'income')
    exp = sum(1 for t in tx_rows if t['type'] == 'expense')
    ccp = sum(1 for t in tx_rows if t['type'] == 'credit_card_purchase')
    inv = sum(1 for t in tx_rows if t['type'].startswith('investment'))
    pay = sum(1 for t in tx_rows if t['type'] == 'credit_card_payment')
    print(f'transações: {len(tx_rows)}  (income={inc} expense={exp} cc_purchase={ccp} '
          f'investment={inv} cc_payment={pay})', file=sys.stderr)
    print(f'categorias: {len(cats.order)}   saldos checking: {len(balances)}   '
          f'saldos XP: {len(xp_balances)}', file=sys.stderr)
    print(f'-> {os.path.relpath(OUT)}', file=sys.stderr)

ACCOUNTS = [
    dict(id='faz-acc-sicredi', user_id='fazenda', name='Sicredi Conta', bank='sicredi', balance=0, is_investment=False, custodian=None),
    dict(id='faz-acc-itau', user_id='fazenda', name='Itaú Conta', bank='itau', balance=0, is_investment=False, custodian=None),
    dict(id='faz-acc-xp-profissional', user_id='fazenda', name='XP Profissional', bank='xp', balance=0, is_investment=True, custodian='XP'),
    dict(id='faz-acc-xp-pessoal', user_id='fazenda', name='XP Pessoal', bank='xp', balance=0, is_investment=True, custodian='XP'),
]
CARDS = [
    dict(id='faz-card-visa', user_id='fazenda', name='Sicredi Visa', bank='sicredi', invoice_total=0, invoice_paid=0),
    dict(id='faz-card-black', user_id='fazenda', name='Cartão Black', bank='itau', invoice_total=0, invoice_paid=0),
]

def write_json(tx_rows, cats, balances, xp_balances):
    import json
    categories = [dict(id=cats.id_of[n], name=n, is_essential=False, user_id='fazenda') for n in cats.order]
    txs = []
    for t in tx_rows:
        txs.append(dict(
            user_id='fazenda', account_id=t['account_id'], credit_card_id=t['credit_card_id'],
            date=t['date'], competency_month=t['competency_month'], statement_month=t['statement_month'],
            amount=round(t['amount'], 2), signed_amount=round(t['signed_amount'], 2),
            direction=t['direction'], type=t['type'], description=t['description'],
            category_id=cats.cid(t['catname']), context=t['context'], scope='individual',
            external_id=t['external_id'], source=t['source'],
        ))
    bh = [dict(account_id=a, month=m, balance=round(b, 2)) for (a, m), (_, b) in balances.items()]
    bh += [dict(account_id=a, month=m, balance=round(b, 2)) for a, m, b in xp_balances]
    out = OUT.replace('.sql', '.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(dict(users=[dict(id='fazenda', name='Fazenda', investment_target_pct=20)],
                       accounts=ACCOUNTS, credit_cards=CARDS, categories=categories,
                       transactions=txs, account_balance_history=bh), f, ensure_ascii=False)

def write_sql(tx_rows, cats, balances, xp_balances):
    L = []
    L.append('-- ============================================================')
    L.append('-- SEED FAZENDA — histórico migrado da planilha Sicredi (gerado por')
    L.append('-- scripts/parse_fazenda_xlsx.py). Idempotente: on conflict do nothing.')
    L.append('-- Rodar no SQL Editor DEPOIS de 20260707_categories_owner.sql.')
    L.append('-- ============================================================')
    L.append('')
    L.append("insert into users (id, name, investment_target_pct) values ('fazenda','Fazenda',20) on conflict (id) do nothing;")
    L.append('')

    # accounts
    L.append('-- contas')
    L.append("insert into accounts (id, user_id, name, bank, balance, is_investment, custodian) values")
    accs = [
        ('faz-acc-sicredi', 'Sicredi Conta', 'sicredi', 'false', 'null'),
        ('faz-acc-itau', 'Itaú Conta', 'itau', 'false', 'null'),
        ('faz-acc-xp-profissional', 'XP Profissional', 'xp', 'true', "'XP'"),
        ('faz-acc-xp-pessoal', 'XP Pessoal', 'xp', 'true', "'XP'"),
    ]
    L.append(',\n'.join(
        f"  ({q(i)},'fazenda',{q(n)},{q(b)},0,{inv},{cus})" for i, n, b, inv, cus in accs
    ) + '\non conflict (id) do nothing;')
    L.append('')

    # credit cards
    L.append('-- cartões')
    L.append("insert into credit_cards (id, user_id, name, bank, invoice_total, invoice_paid) values")
    L.append(",\n".join([
        "  ('faz-card-visa','fazenda','Sicredi Visa','sicredi',0,0)",
        "  ('faz-card-black','fazenda','Cartão Black','itau',0,0)",
    ]).replace(")\n  (", "),\n  (") + "\non conflict (id) do nothing;")
    L.append('')

    # categories
    L.append('-- categorias da fazenda')
    L.append('insert into categories (id, name, is_essential, user_id) values')
    cat_vals = [f"  ({q(cats.id_of[n])},{q(n)},false,'fazenda')" for n in cats.order]
    L.append(',\n'.join(cat_vals) + '\non conflict (id) do nothing;')
    L.append('')

    # transactions (batched)
    cols = ('user_id, account_id, credit_card_id, date, competency_month, statement_month, '
            'amount, signed_amount, direction, type, description, category_id, context, scope, '
            'external_id, source')
    L.append('-- transações')
    B = 400
    for i in range(0, len(tx_rows), B):
        chunk = tx_rows[i:i + B]
        L.append(f'insert into transactions ({cols}) values')
        vals = []
        for t in chunk:
            vals.append(
                f"  ('fazenda',{q(t['account_id'])},{q(t['credit_card_id'])},{q(t['date'])},"
                f"{q(t['competency_month'])},{q(t['statement_month'])},{t['amount']:.2f},"
                f"{t['signed_amount']:.2f},{q(t['direction'])},{q(t['type'])},{q(t['description'])},"
                f"{q(cats.cid(t['catname']))},{q(t['context'])},'individual',"
                f"{q(t['external_id'])},{q(t['source'])})"
            )
        L.append(',\n'.join(vals) + '\non conflict (external_id, source) do nothing;')
        L.append('')

    # account_balance_history: checking month-end + XP monthly
    L.append('-- histórico de saldos (checking mês a mês + XP pessoal/profissional)')
    bh = [(acc, month, bal) for (acc, month), (_, bal) in balances.items()]
    bh += xp_balances
    for i in range(0, len(bh), B):
        chunk = bh[i:i + B]
        L.append('insert into account_balance_history (account_id, month, balance) values')
        L.append(',\n'.join(f"  ({q(a)},{q(m)},{bal:.2f})" for a, m, bal in chunk)
                 + '\non conflict (account_id, month) do nothing;')
        L.append('')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L))

if __name__ == '__main__':
    main()
