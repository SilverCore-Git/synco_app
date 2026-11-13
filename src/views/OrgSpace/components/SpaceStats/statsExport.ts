import { createZipBlob } from '@/assets/utils/zip';
import { saveBlob } from '@/assets/utils/downloadFile';
import { bucketLabel, FAMILY_LABELS, WEEKDAYS } from './statsFormat';
import type { FileStatsResponse, TaskStatsResponse } from './statsTypes';

/**
 * Export des statistiques, sans dépendance :
 *  - Excel (.xlsx) : une feuille par tableau (SpreadsheetML écrit à la main,
 *    empaqueté par notre writer ZIP) ;
 *  - CSV : une archive .zip, un fichier par tableau, au format attendu par
 *    Excel en français (séparateur « ; », virgule décimale, BOM UTF-8) ;
 *  - JSON : les données brutes de l'API, avec la portée et les filtres.
 * Les valeurs restent brutes (octets, heures) pour qu'on puisse calculer dessus.
 */

export type ExportFormat = 'xlsx' | 'csv' | 'json';
type Cell = string | number | null;

export interface StatsTable {
    name: string;
    columns: string[];
    rows: Cell[][];
}

export interface ExportContext {
    /** « Toute l'organisation » ou le nom du space. */
    scopeLabel: string;
    /** Filtres lisibles (période, membre, tags). */
    filters: string[];
    fileBase: string;
}

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

// ── Tableaux ────────────────────────────────────────────────────────────────

function nameMaps(data: { users: Array<{ id: string; name: string }>; tagsMeta: Array<{ id: string; name: string }>; spacesMeta: Array<{ id: string; name: string }> }) {
    const users = new Map(data.users.map(u => [u.id, u.name]));
    const tags = new Map(data.tagsMeta.map(t => [t.id, t.name]));
    const spaces = new Map(data.spacesMeta.map(s => [s.id, s.name]));
    return {
        user: (id: string) => users.get(id) ?? id,
        tag: (id: string | null) => (id ? tags.get(id) ?? 'Tag supprimé' : 'Sans tag'),
        space: (id: string | null) => (id ? spaces.get(id) ?? 'Space supprimé' : 'Hors space'),
    };
}

function summary(ctx: ExportContext, period: TaskStatsResponse['period'], rows: Array<[string, Cell]>): StatsTable {
    return {
        name: 'Résumé',
        columns: ['Indicateur', 'Valeur'],
        rows: [
            ['Portée', ctx.scopeLabel],
            ['Du', period.from.slice(0, 10)],
            ['Au', period.to.slice(0, 10)],
            ['Fuseau', period.timezone],
            ...ctx.filters.map((f): [string, Cell] => ['Filtre', f]),
            ...rows,
        ],
    };
}

function heatmapTable(name: string, grid: number[][]): StatsTable {
    return {
        name,
        columns: ['Jour', ...Array.from({ length: 24 }, (_, h) => `${h} h`)],
        rows: grid.map((row, d) => [WEEKDAYS[d] ?? String(d), ...row]),
    };
}

export function taskTables(data: TaskStatsResponse, ctx: ExportContext): StatsTable[] {
    const n = nameMaps(data);
    const k = data.kpis;
    const g = data.period.granularity;
    const tables: StatsTable[] = [
        summary(ctx, data.period, [
            ['Tâches actives', k.total],
            ['À faire', k.todo],
            ['En cours', k.inProgress],
            ['Terminées (actives)', k.done],
            ['Archivées', k.archived],
            ['En retard', k.overdue],
            ['Échéance sous 7 jours', k.dueSoon],
            ['Ouvertes non assignées', k.unassigned],
            ['Ouvertes sans échéance', k.noDueDate],
            ['Créées sur la période', k.created],
            ['Créées sur la période précédente', k.previous.created],
            ['Terminées sur la période', k.completed],
            ['Terminées sur la période précédente', k.previous.completed],
            ['Réouvertures', k.reopened],
            ['Délai de résolution médian (h)', round1(k.leadTime.medianHours)],
            ['Délai de résolution p90 (h)', round1(k.leadTime.p90Hours)],
            ['Temps de cycle médian (h)', round1(k.cycleTime.medianHours)],
            ['Temps de cycle p90 (h)', round1(k.cycleTime.p90Hours)],
            ['Terminées dans les temps', k.onTime.onTime],
            ['Terminées en retard', k.onTime.late],
            ['Tâches avec fichiers', k.withFiles],
            ['Sous-tâches', k.subtasks.total],
            ['Sous-tâches terminées', k.subtasks.done],
            ['Historique depuis', data.historySince ? data.historySince.slice(0, 10) : null],
        ]),
        {
            name: 'Flux',
            columns: ['Période', 'Créées', 'Terminées', 'Ouvertes en fin de période'],
            rows: data.flow.map(f => [bucketLabel(f.bucket, g, true), f.created, f.completed, f.open]),
        },
    ];
    if (data.scope === 'org') {
        tables.push({
            name: 'Spaces',
            columns: ['Space', 'Actives', 'Ouvertes', 'Terminées (période)', 'En retard'],
            rows: data.spaces.map(s => [n.space(s.spaceId), s.total, s.open, s.completed, s.overdue]),
        });
    }
    tables.push(
        {
            name: 'Membres',
            columns: ['Membre', 'Ouvertes', 'En cours', 'Terminées (période)', 'En retard', 'Créées (période)', 'Délai médian (h)'],
            rows: data.members.map(m => [n.user(m.userId), m.open, m.inProgress, m.completed, m.overdue, m.created, round1(m.leadTimeMedianHours)]),
        },
        {
            name: 'Tags',
            columns: ['Tag', 'Actives', 'Ouvertes', 'Terminées (période)', 'En retard'],
            rows: data.tags.map(t => [n.tag(t.tagId), t.total, t.open, t.completed, t.overdue]),
        },
        {
            name: 'Listes',
            columns: ['Liste', 'Tâches', 'Terminées'],
            rows: data.lists.map(l => [l.title, l.total, l.done]),
        },
        {
            name: 'Âge',
            columns: ['Âge des tâches ouvertes', 'Tâches'],
            rows: data.age.map(a => [a.label, a.count]),
        },
        {
            name: 'En retard',
            columns: ['Tâche', 'Space', 'Échéance', 'Assignés'],
            rows: data.overdueTasks.map(t => [t.title, n.space(t.spaceId), t.dueDate.slice(0, 10), t.assigneeIds.map(n.user).join(', ')]),
        },
        {
            name: 'Bloquées',
            columns: ['Tâche', 'Space', 'En cours depuis', 'Assignés'],
            rows: data.stuck.map(t => [t.title, n.space(t.spaceId), t.since.slice(0, 10), t.assigneeIds.map(n.user).join(', ')]),
        },
        heatmapTable('Rythme (terminées)', data.heatmap.completed),
        heatmapTable('Rythme (créées)', data.heatmap.created),
    );
    return tables;
}

export function fileTables(data: FileStatsResponse, ctx: ExportContext): StatsTable[] {
    const n = nameMaps(data);
    const k = data.kpis;
    const g = data.period.granularity;
    const tables: StatsTable[] = [
        summary(ctx, data.period, [
            ['Fichiers', k.files],
            ['Volume (octets)', k.bytes],
            ['Dossiers', k.folders],
            ['Ajoutés sur la période', k.added],
            ['Octets ajoutés sur la période', k.addedBytes],
            ['Ajoutés sur la période précédente', k.previous.added],
            ['Octets ajoutés sur la période précédente', k.previous.addedBytes],
            ['Fichiers dormants (> 6 mois)', k.dormant.files],
            ['Octets dormants', k.dormant.bytes],
            ['Quota de l’organisation utilisé (octets)', data.quota?.orgUsed ?? null],
            ['Quota de l’organisation (octets)', data.quota?.orgMax ?? null],
            ['Fichiers liés à une tâche', data.tasks.filesLinkedToTasks],
            ['Tâches avec fichier', data.tasks.tasksWithFiles],
            ['Tâches', data.tasks.tasksTotal],
        ]),
        {
            name: 'Évolution',
            columns: ['Période', 'Fichiers ajoutés', 'Octets ajoutés', 'Volume cumulé (octets)'],
            rows: data.series.map(s => [bucketLabel(s.bucket, g, true), s.uploads, s.bytes, s.cumulativeBytes]),
        },
        {
            name: 'Types',
            columns: ['Type', 'Fichiers', 'Octets'],
            rows: data.types.map(t => [FAMILY_LABELS[t.family].label, t.files, t.bytes]),
        },
        {
            name: 'Origine',
            columns: ['Origine', 'Fichiers', 'Octets'],
            rows: [
                ['Gestionnaire de fichiers', data.origin.space.files, data.origin.space.bytes],
                ['Pièces jointes de messages', data.origin.messages.files, data.origin.messages.bytes],
                ['Images de tâches', data.origin.tasks.files, data.origin.tasks.bytes],
            ],
        },
        data.scope === 'org'
            ? { name: 'Spaces', columns: ['Space', 'Fichiers', 'Octets'], rows: data.spaces.map(s => [n.space(s.spaceId), s.files, s.bytes]) }
            : { name: 'Dossiers', columns: ['Dossier', 'Fichiers', 'Octets'], rows: data.folders.map(f => [f.name, f.files, f.bytes]) },
        {
            name: 'Membres',
            columns: ['Membre', 'Fichiers', 'Octets', 'Ajoutés (période)', 'Dernier ajout'],
            rows: data.members.map(m => [n.user(m.userId), m.files, m.bytes, m.added, m.lastAt ? m.lastAt.slice(0, 10) : null]),
        },
        {
            name: 'Plus gros fichiers',
            columns: ['Fichier', 'Type MIME', 'Octets', 'Propriétaire', 'Space', 'Ajouté le'],
            rows: data.largest.map(f => [f.name, f.mimeType, f.size, n.user(f.ownerId), n.space(f.spaceId), f.createdAt.slice(0, 10)]),
        },
        {
            name: 'Tags',
            columns: ['Tag', 'Fichiers', 'Octets'],
            rows: data.tags.map(t => [n.tag(t.tagId), t.files, t.bytes]),
        },
    ];
    return tables;
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const csvCell = (v: Cell): string => {
    if (v === null) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(table: StatsTable): string {
    const lines = [table.columns, ...table.rows].map(r => r.map(csvCell).join(';'));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

// ── XLSX ────────────────────────────────────────────────────────────────────

const xml = (s: string) => s
    // Caractères de contrôle interdits en XML 1.0 (sauf tab, LF, CR).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colName = (i: number): string => {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
};

/** Nom de feuille Excel : 31 caractères, sans []:*?/\, unique. */
function sheetNames(tables: StatsTable[]): string[] {
    const used = new Set<string>();
    return tables.map(t => {
        const base = t.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Feuille';
        let name = base;
        for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
        used.add(name.toLowerCase());
        return name;
    });
}

function sheetXml(table: StatsTable): string {
    const all = [table.columns, ...table.rows];
    const widths = table.columns.map((_, c) => Math.min(60, Math.max(8, ...all.map(r => String(r[c] ?? '').length + 2))));
    const rows = all.map((row, r) => {
        const cells = row.map((v, c) => {
            const ref = `${colName(c)}${r + 1}`;
            if (v === null || v === '') return '';
            if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${r === 0 ? ' s="1"' : ''}><v>${v}</v></c>`;
            return `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
        }).join('');
        return `<row r="${r + 1}">${cells}</row>`;
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
        + `<sheetData>${rows}</sheetData></worksheet>`;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export async function toXlsx(tables: StatsTable[]): Promise<Blob> {
    const names = sheetNames(tables);
    const text = (s: string) => new Blob([s], { type: 'application/xml' });
    const entries = [
        {
            path: '[Content_Types].xml',
            data: text(XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                + '<Default Extension="xml" ContentType="application/xml"/>'
                + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                + tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
                + '</Types>'),
        },
        {
            path: '_rels/.rels',
            data: text(XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
        },
        {
            path: 'xl/workbook.xml',
            data: text(XML_HEAD + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>`
                + names.map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
                + '</sheets></workbook>'),
        },
        {
            path: 'xl/_rels/workbook.xml.rels',
            data: text(XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
                + `<Relationship Id="rId${tables.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`),
        },
        {
            path: 'xl/styles.xml',
            data: text(XML_HEAD + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
                + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
                + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
                + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
                + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
                + '</styleSheet>'),
        },
        ...tables.map((t, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, data: text(sheetXml(t)) })),
    ];
    const zip = await createZipBlob(entries);
    return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── Point d'entrée ──────────────────────────────────────────────────────────

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'export';

export async function exportStats(
    format: ExportFormat,
    kind: 'tasks' | 'files',
    data: TaskStatsResponse | FileStatsResponse,
    ctx: ExportContext,
): Promise<void> {
    const base = slug(ctx.fileBase);
    if (format === 'json') {
        const payload = { exportedAt: new Date().toISOString(), scope: ctx.scopeLabel, filters: ctx.filters, kind, data };
        saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${base}.json`);
        return;
    }

    const tables = kind === 'tasks' ? taskTables(data as TaskStatsResponse, ctx) : fileTables(data as FileStatsResponse, ctx);
    if (format === 'xlsx') {
        saveBlob(await toXlsx(tables), `${base}.xlsx`);
        return;
    }

    const used = new Set<string>();
    const entries = tables.map(t => {
        let name = slug(t.name);
        for (let i = 2; used.has(name); i++) name = `${slug(t.name)}-${i}`;
        used.add(name);
        return { path: `${name}.csv`, data: new Blob([toCsv(t)], { type: 'text/csv' }) };
    });
    saveBlob(await createZipBlob(entries), `${base}-csv.zip`);
}
