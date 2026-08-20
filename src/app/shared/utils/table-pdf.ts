import { DataTableColumn } from '../components/data-table';
import { downloadTablePdf } from '../pdf/html-pdf';

export function tablePdfRows(
  columns: DataTableColumn[],
  rows: any[],
): Array<Array<string | number>> {
  return rows.map((row) =>
    columns.map((col) => {
      if (col.format) return String(col.format(row) ?? '');
      const v = row?.[col.key];
      return v == null || v === '' ? '—' : String(v);
    }),
  );
}

export async function downloadColumnsPdf(opts: {
  title: string;
  subtitle?: string;
  filename: string;
  columns: DataTableColumn[];
  rows: any[];
}): Promise<void> {
  await downloadTablePdf({
    title: opts.title,
    subtitle: opts.subtitle,
    filename: opts.filename,
    headers: opts.columns.map((c) => c.label),
    rows: tablePdfRows(opts.columns, opts.rows),
  });
}
