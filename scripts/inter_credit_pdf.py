#!/usr/bin/env python3
"""
Inter Credit Card PDF Handler
------------------------------
Reads an Inter fatura PDF and exports a TSV-formatted CSV.

Usage:
    python3 scripts/inter_credit_pdf.py <fatura.pdf> [output.csv]

Output format (tab-separated):
    DD/MM/YYYY\tDescription\t\t-R$ X,XX

Rules:
  - Only "Despesas da fatura" section is processed
  - "Próxima fatura" section is ignored
  - Positive entries (PGTO PIX, credits) are ignored
  - Validates sum of extracted transactions against invoice total
"""

import re
import sys
from pathlib import Path
from typing import Optional

try:
    import pdfplumber
except ImportError:
    print("Erro: pdfplumber não instalado. Rode: pip3 install pdfplumber", file=sys.stderr)
    sys.exit(1)


MONTH_MAP = {
    'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
    'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
    'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
}

# Matches transaction lines:
# "14 de ago. 2025  EM DIA - PROGRAMA TV C (Parcela 02 de 02) - R$ 1.842,95"
# "13 de set. 2025  PGTO PIX - + R$ 3.326,57"
TX_RE = re.compile(
    r'^(\d{1,2})\s+de\s+(\w+\.?)\s+(\d{4})\s+'  # date: DD de MMM. YYYY
    r'(.+?)'                                       # description (lazy)
    r'\s+-\s+'                                     # beneficiário separator (always " - ")
    r'([+-]?)\s*R\$\s*([\d.]+,\d{2})\s*$'         # optional sign + value (absent = expense)
)

# Matches invoice total from page header:
# "2306****9689  07/10/2025  R$ 4.315,90"
# Header total (fatura atual — after prepayments)
TOTAL_RE = re.compile(
    r'\d{4}\*{4}\d{4}\s+\d{2}/\d{2}/\d{4}\s+R\$\s*([\d.]+,\d{2})'
)

# "Despesas do mês R$ 4.111,00" — gross total before prepayments
DESPESAS_RE = re.compile(
    r'Despesas do m[eê]s\s+R\$\s*([\d.]+,\d{2})'
)

# "Valor antecipado R$ 1.996,00"
ANTECIPADO_RE = re.compile(
    r'Valor antecipado\s+R\$\s*([\d.]+,\d{2})'
)

# Installment: "(Parcela 02 de 03)" → "- Parcela 2/3"
INSTALLMENT_RE = re.compile(r'\s*\(Parcela\s+0*(\d+)\s+de\s+0*(\d+)\)')


def parse_brl(value: str) -> float:
    """'1.842,95' → 1842.95"""
    return float(value.replace('.', '').replace(',', '.'))


def format_brl(value: float) -> str:
    """1842.95 → 'R$ 1.842,95'"""
    integer, decimal = f"{value:.2f}".split('.')
    # Add thousands separator (Brazilian: period)
    parts = []
    while len(integer) > 3:
        parts.append(integer[-3:])
        integer = integer[:-3]
    parts.append(integer)
    return 'R$ ' + '.'.join(reversed(parts)) + ',' + decimal


def format_date(day: str, month_abbr: str, year: str) -> str:
    month = MONTH_MAP.get(month_abbr.lower().rstrip('.'), '00')
    return f"{day.zfill(2)}/{month}/{year}"


def normalize_description(raw: str) -> str:
    """Normalize installment suffix and trim whitespace."""
    return INSTALLMENT_RE.sub(
        lambda m: f' - Parcela {m.group(1)}/{m.group(2)}',
        raw
    ).strip()


def extract_totals(pages: list) -> dict:
    """Return dict with fatura_atual, despesas_mes, valor_antecipado."""
    result = {}
    full_text = '\n'.join(pages)

    m = TOTAL_RE.search(full_text)
    if m:
        result['fatura_atual'] = parse_brl(m.group(1))

    m = DESPESAS_RE.search(full_text)
    if m:
        result['despesas_mes'] = parse_brl(m.group(1))

    m = ANTECIPADO_RE.search(full_text)
    if m:
        result['valor_antecipado'] = parse_brl(m.group(1))

    return result


def extract_transactions(pages: list) -> list:
    transactions = []
    in_despesas = False

    for text in pages:
        # Stop entirely once we hit "Próxima fatura" across pages
        if 'Próxima fatura' in text:
            # Process only the part before that heading
            text = text[:text.index('Próxima fatura')]

        for line in text.splitlines():
            line = line.strip()

            if 'Despesas da fatura' in line:
                in_despesas = True
                continue

            if not in_despesas:
                continue

            m = TX_RE.match(line)
            if not m:
                continue

            day, month_abbr, year, description, sign, amount_str = m.groups()

            # Ignore credits/payments (explicit '+' sign = PGTO PIX, estornos)
            if sign == '+':
                continue

            transactions.append({
                'date':        format_date(day, month_abbr, year),
                'description': normalize_description(description),
                'amount':      parse_brl(amount_str),
            })

    return transactions


def validate(transactions: list, totals: dict) -> bool:
    """Print validation report. Returns True if OK."""
    extracted = sum(t['amount'] for t in transactions)

    # Validation target: "despesas_mes" when available (gross total before prepayments),
    # otherwise fall back to "fatura_atual" (works when valor_antecipado == 0)
    target      = totals.get('despesas_mes') or totals.get('fatura_atual')
    antecipado  = totals.get('valor_antecipado', 0.0)
    fatura_atual = totals.get('fatura_atual')

    print(f"  Transações extraídas : {len(transactions)}", file=sys.stderr)
    print(f"  Soma extraída        : {format_brl(extracted)}", file=sys.stderr)

    if fatura_atual is not None:
        print(f"  Fatura atual         : {format_brl(fatura_atual)}", file=sys.stderr)
    if antecipado:
        print(f"  Valor antecipado     : {format_brl(antecipado)}", file=sys.stderr)
    if totals.get('despesas_mes'):
        print(f"  Despesas do mês      : {format_brl(totals['despesas_mes'])}", file=sys.stderr)

    if target is None:
        print("  Validação            : totais não encontrados (ignorada)", file=sys.stderr)
        return True

    diff = abs(extracted - target)
    if diff < 0.02:
        print("  Validação            : ✓ OK", file=sys.stderr)
        return True
    else:
        print(f"  Validação            : ✗ DIVERGÊNCIA de {format_brl(diff)}", file=sys.stderr)
        return False


def to_csv(transactions: list) -> str:
    lines = []
    for t in transactions:
        lines.append(f"{t['date']}\t{t['description']}\t\t-{format_brl(t['amount'])}")
    return '\n'.join(lines) + '\n'


def main(pdf_path: str, output_path: Optional[str] = None):
    path = Path(pdf_path)
    if not path.exists():
        print(f"Erro: arquivo não encontrado: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Lendo {path.name}...", file=sys.stderr)

    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)

    totals       = extract_totals(pages)
    transactions = extract_transactions(pages)

    if not transactions:
        print("Erro: nenhuma transação encontrada.", file=sys.stderr)
        sys.exit(1)

    print("", file=sys.stderr)
    ok = validate(transactions, totals)
    print("", file=sys.stderr)

    csv_content = to_csv(transactions)

    out = Path(output_path) if output_path else path.with_suffix('.csv')
    out.write_text(csv_content, encoding='utf-8')
    print(f"CSV salvo em: {out}", file=sys.stderr)

    if not ok:
        sys.exit(2)  # Exit 2 = validation failed (file still written)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f"Uso: python3 {sys.argv[0]} <fatura.pdf> [output.csv]", file=sys.stderr)
        sys.exit(1)

    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
