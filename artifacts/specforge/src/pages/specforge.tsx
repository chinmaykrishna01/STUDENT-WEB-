import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowRight,
  BookOpenCheck, Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck,
  FileCheck2, FileText, FileUp, GraduationCap, LayoutDashboard, LoaderCircle,
  Menu, MessageSquareText, MoreHorizontal, Plus, RefreshCw, ShieldCheck, Sparkles,
  Trash2, Upload, X, XCircle,
} from 'lucide-react';
import {
  getGetAnalysisQueryKey, getGetAnalysesQueryKey, getGetDashboardQueryKey,
  useCreateAnalysis, useCreateDemoAnalysis, useDeleteAnalysis, useGetAnalyses,
  useGetAnalysis, useGetDashboard, useReviewIssue, useUpdateAnalysis, useUpdateMapping,
  type Analysis, type AnalysisUpload, type CourseData, type ValidationIssue,
} from '@workspace/api-client-react';

const roleNames: Record<string, string> = {
  courseSpecification: 'Course specification',
  blueprint: 'Question paper blueprint',
  template: 'Official HTML template',
  outcomeDefinitions: 'PO / PSO definitions',
  institutionalRules: 'Institutional rules',
};

function cx(...values: (string | false | undefined)[]) { return values.filter(Boolean).join(' '); }
function dateLabel(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
function statusLabel(status?: string) {
  return status === 'accepted' ? 'Accepted by reviewer' : status === 'rejected' ? 'Not accepted' : status === 'deferred' ? 'Deferred' : 'Pending review';
}

function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    quiet: 'text-slate-600 hover:bg-slate-100',
    danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  };
  return <button {...props} className={cx('inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', variants[variant], className)}>{children}</button>;
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(19,35,65,.035)]', className)}>{children}</section>;
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div><div className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-indigo-600">{eyebrow}</div><h1 className="brand-font text-[26px] font-bold tracking-[-.035em] text-slate-900 md:text-[32px]">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>
    {action}
  </div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const inAnalysis = path.startsWith('/analyses/');
  const activeAnalysis = path.startsWith('/analyses/') && path !== '/analyses/new';
  const nav = [
    { href: '/', label: 'Overview', icon: LayoutDashboard, active: path === '/' },
    { href: '/analyses/new', label: 'New analysis', icon: Plus, active: path === '/analyses/new' },
  ];
  return <div className="app-shell bg-[#f5f7fa]">
    <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[#18253b] text-slate-300 transition-transform duration-200 md:translate-x-0', mobileMenu ? 'translate-x-0' : '-translate-x-full')}>
      <Link href="/" className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6 text-white no-underline" data-testid="link-brand-home">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500/20 text-indigo-300"><BookOpenCheck size={19} /></div>
        <div><div className="brand-font text-[17px] font-extrabold tracking-[-.04em]">SpecForge</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Academic review</div></div>
      </Link>
      <div className="px-4 pt-7">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Workspace</div>
        {nav.map(({ href, label, icon: Icon, active }) => <Link key={href} href={href} onClick={() => setMobileMenu(false)} data-testid={`nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={cx('mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold no-underline transition-colors', active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')}><Icon size={17} strokeWidth={1.8} />{label}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-300" />}</Link>)}
        <a href="/generator/" onClick={() => setMobileMenu(false)} data-testid="nav-submission-generator" className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-slate-400 no-underline transition-colors hover:bg-white/5 hover:text-slate-100"><FileUp size={17} strokeWidth={1.8} />Submission files</a>
      </div>
      <div className="mx-5 my-6 border-t border-white/10" />
      <div className="px-4">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Review principles</div>
        <div className="space-y-3 px-3 py-2 text-[11px] leading-[1.6] text-slate-400">
          <div className="flex gap-2.5"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-teal-300" /><span>Original course wording stays visible.</span></div>
          <div className="flex gap-2.5"><CircleHelp size={15} className="mt-0.5 shrink-0 text-amber-300" /><span>Suggestions remain suggestions until reviewed.</span></div>
          <div className="flex gap-2.5"><ClipboardCheck size={15} className="mt-0.5 shrink-0 text-slate-300" /><span>Human decisions are recorded separately.</span></div>
        </div>
      </div>
      <div className="mt-auto border-t border-white/10 p-5">
        <div className="flex items-center gap-3 rounded-xl bg-white/[.045] px-3 py-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-600 text-[11px] font-bold text-white">FA</div>
          <div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-100">Faculty reviewer</div><div className="mt-0.5 text-[10px] text-slate-400">Institution workspace</div></div>
          <MoreHorizontal size={17} className="ml-auto text-slate-500" />
        </div>
      </div>
    </aside>
    {mobileMenu && <button aria-label="Close navigation" onClick={() => setMobileMenu(false)} className="fixed inset-0 z-30 bg-slate-950/30 md:hidden" />}
    <div className="min-h-[100dvh] md:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-slate-200/90 bg-white/95 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <button aria-label="Open navigation" onClick={() => setMobileMenu(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" data-testid="button-open-navigation"><Menu size={19} /></button>
          <div className="hidden text-xs text-slate-400 sm:block">Faculty workspace <span className="mx-2 text-slate-300">/</span><span className="font-medium text-slate-600">{activeAnalysis ? 'Analysis review' : path === '/analyses/new' ? 'New analysis' : 'Overview'}</span></div>
          <div className="text-xs font-semibold text-slate-600 sm:hidden">SpecForge</div>
        </div>
        <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Review mode</div><div className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-[#eef0fb] text-[10px] font-bold text-indigo-700">FR</div></div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-7 md:px-8 md:py-9">{children}</main>
    </div>
  </div>;
}

function MetricCard({ label, value, note, icon: Icon, tone = 'indigo' }: { label: string; value: number | string; note: string; icon: typeof FileText; tone?: string }) {
  const toneClass: Record<string, string> = { indigo: 'bg-indigo-50 text-indigo-700', teal: 'bg-teal-50 text-teal-700', amber: 'bg-amber-50 text-amber-700' };
  return <Panel className="p-5"><div className="flex items-start justify-between"><div><div className="text-xs font-medium text-slate-500">{label}</div><div className="brand-font mt-2 text-[30px] font-bold leading-none tracking-[-.04em] text-slate-900" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div></div><div className={cx('grid h-9 w-9 place-items-center rounded-lg', toneClass[tone] ?? toneClass.indigo)}><Icon size={17} /></div></div><div className="mt-3 text-[11px] text-slate-400">{note}</div></Panel>;
}

function LoadingRows() { return <div className="space-y-3 p-5" aria-label="Loading analyses">{[0, 1, 2].map((v) => <div key={v} className="skeleton h-[62px] rounded-lg" />)}</div>; }

export function HomePage() {
  const queryClient = useQueryClient();
  const dashboard = useGetDashboard();
  const analyses = useGetAnalyses();
  const demo = useCreateDemoAnalysis();
  const remove = useDeleteAnalysis();
  const [, setLocation] = useLocation();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const recent = analyses.data ?? dashboard.data?.recentAnalyses ?? [];
  const summary = dashboard.data;
  const pending = recent.reduce((n, a) => n + a.issues.filter((issue) => issue.status === 'pending').length, 0);
  const issueTotal = summary?.detectedIssues ?? recent.reduce((n, a) => n + a.issues.length, 0);
  const approvalTotal = summary?.pendingApprovals ?? recent.filter((a) => !a.approvalsComplete).length;
  const startDemo = () => demo.mutate(undefined, { onSuccess: async (analysis) => { await Promise.all([queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), queryClient.invalidateQueries({ queryKey: getGetAnalysesQueryKey() })]); setLocation(`/analyses/${analysis.id}`); }, onError: () => setNotice('The fictional demo could not be created. Please try again.') });
  const deleteAnalysis = (analysis: Analysis) => {
    if (deleteId !== analysis.id) { setDeleteId(analysis.id); return; }
    remove.mutate({ analysisId: analysis.id }, { onSuccess: async () => { setDeleteId(null); await Promise.all([queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), queryClient.invalidateQueries({ queryKey: getGetAnalysesQueryKey() })]); }, onError: () => setNotice('Could not delete this analysis. Please try again.') });
  };
  const loading = dashboard.isLoading && analyses.isLoading;
  return <div className="fade-in">
    <PageHeading eyebrow="Course specification review" title="Good morning, reviewer" description="A careful workspace for checking course documents against the evidence your institution supplies." action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={startDemo} disabled={demo.isPending} data-testid="button-create-demo"><Sparkles size={15} />{demo.isPending ? 'Preparing demo…' : 'Explore fictional demo'}</Button><Link href="/analyses/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white no-underline shadow-sm hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" data-testid="link-start-analysis"><Plus size={16} />Start analysis</Link></div>} />
    {notice && <div role="alert" className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle size={16} />{notice}<button className="ml-auto" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}
    {(dashboard.isError || analyses.isError) && <div className="mb-5 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span>Some dashboard data could not be loaded.</span><Button variant="secondary" onClick={() => { dashboard.refetch(); analyses.refetch(); }}><RefreshCw size={14} />Retry</Button></div>}
    <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Documents analyzed" value={summary?.totalDocumentsAnalyzed ?? recent.length} note="Saved course reviews" icon={FileCheck2} />
      <MetricCard label="Findings detected" value={issueTotal} note="Across all available analyses" icon={AlertTriangle} tone="amber" />
      <MetricCard label="Pending approvals" value={approvalTotal} note="Human review still required" icon={ClipboardCheck} tone="teal" />
      <MetricCard label="Open decisions" value={pending} note="Findings awaiting a reviewer" icon={Activity} />
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,.8fr)]">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><h2 className="brand-font text-[16px] font-bold text-slate-900">Recent analyses</h2><p className="mt-1 text-xs text-slate-500">Your saved course specification reviews</p></div>
          <Link href="/analyses/new" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-indigo-700 no-underline hover:bg-indigo-50" data-testid="link-new-analysis-list">New analysis <ArrowRight size={14} /></Link>
        </div>
        {loading ? <LoadingRows /> : recent.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead><tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400"><th className="px-5 py-3">Course</th><th className="px-4 py-3">Review status</th><th className="px-4 py-3">Findings</th><th className="px-4 py-3">Updated</th><th className="px-3 py-3"></th></tr></thead>
            <tbody>{recent.map((analysis) => {
              const open = analysis.issues.filter((i) => i.status === 'pending').length;
              return <tr key={analysis.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70" data-testid={`row-analysis-${analysis.id}`}>
                <td className="px-5 py-4"><Link href={`/analyses/${analysis.id}`} className="no-underline"><div className="text-sm font-semibold text-slate-800 hover:text-indigo-700">{analysis.courseTitle || analysis.name}</div><div className="mono mt-1 text-[10px] text-slate-400">{analysis.courseCode || 'COURSE CODE NOT FOUND'}</div></Link></td>
                <td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{analysis.approvalsComplete ? 'Approval record complete' : 'Draft · review pending'}</span></td>
                <td className="px-4 py-4"><span className={cx('text-xs font-semibold', open ? 'text-amber-700' : 'text-slate-500')}>{open} pending <span className="font-normal text-slate-400">/ {analysis.issues.length} total</span></span></td>
                <td className="px-4 py-4 text-xs text-slate-500">{dateLabel(analysis.updatedAt)}</td>
                <td className="px-3 py-4"><div className="flex items-center justify-end gap-1"><Link aria-label={`Open ${analysis.courseTitle}`} href={`/analyses/${analysis.id}`} className="rounded-md p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700" data-testid={`link-open-analysis-${analysis.id}`}><ArrowRight size={16} /></Link><button aria-label={deleteId === analysis.id ? 'Confirm delete analysis' : 'Delete analysis'} onClick={() => deleteAnalysis(analysis)} className={cx('rounded-md p-2 hover:bg-red-50', deleteId === analysis.id ? 'text-red-700' : 'text-slate-400')} data-testid={`button-delete-analysis-${analysis.id}`}>{deleteId === analysis.id ? <Check size={15} /> : <Trash2 size={15} />}</button>{deleteId === analysis.id && <button aria-label="Cancel delete" onClick={() => setDeleteId(null)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100" data-testid={`button-cancel-delete-${analysis.id}`}><X size={15} /></button>}</div></td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <div className="px-6 py-12 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><FileText size={21} /></div><h3 className="brand-font mt-4 text-base font-bold text-slate-800">Start with a course specification</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">Add a course document and any official institutional evidence you want considered. Nothing is assumed when evidence is absent.</p><Link href="/analyses/new" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-indigo-700" data-testid="link-empty-start"><Plus size={15} />Create your first analysis</Link></div>}
      </Panel>
      <div className="space-y-5">
        <Panel className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="brand-font text-[15px] font-bold text-slate-900">Review queue</h2><p className="mt-1 text-xs text-slate-500">Work that still needs a human decision</p></div>
          <div className="p-5">
            <div className="mb-4 flex items-end justify-between"><div className="brand-font text-[34px] font-bold leading-none tracking-[-.04em] text-slate-900">{pending}</div><span className="mb-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Pending findings</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pending ? Math.max(8, Math.min(100, 100 - (pending / Math.max(issueTotal, 1)) * 100)) : 100}%` }} /></div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">Suggestions are not treated as decisions. Review each finding against the source evidence before accepting or rejecting it.</p>
          </div>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-teal-700"><ShieldCheck size={16} /></div><h2 className="brand-font text-sm font-bold text-slate-900">Evidence-first by design</h2></div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Course wording is preserved for comparison. Mappings and corrections remain clearly marked as suggested until a reviewer decides.</p>
          <div className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-400">Official policy is only evaluated when supplied in this analysis.</div>
        </Panel>
      </div>
    </div>
  </div>;
}

type FileRole = 'courseSpecification' | 'blueprint' | 'template' | 'outcomeDefinitions' | 'institutionalRules';
const documentAccept = '.docx,.doc,.pdf,.pptx,.xlsx,.odt,.odp,.ods,.odg,.rtf,.csv,.tsv,.md,.txt,.html,.htm,.json,.epub,.tex';
const uploadFields: { role: FileRole; label: string; help: string; required?: boolean; accept: string }[] = [
  { role: 'courseSpecification', label: 'Course specification', help: 'PDF, DOC/DOCX, Office, ODF, RTF, CSV, JSON, TXT, and more · required', required: true, accept: documentAccept },
  { role: 'blueprint', label: 'Question paper blueprint', help: 'PDF, DOC/DOCX, Office, ODF, CSV, JSON, TXT, and more · optional', accept: documentAccept },
  { role: 'template', label: 'Official HTML template', help: 'HTML · optional', accept: '.html,.htm,text/html' },
  { role: 'outcomeDefinitions', label: 'PO / PSO definitions', help: 'PDF, DOC/DOCX, Office, ODF, CSV, JSON, TXT, and more · optional', accept: documentAccept },
  { role: 'institutionalRules', label: 'Institutional rules', help: 'PDF, DOC/DOCX, Office, ODF, CSV, JSON, TXT, and more · optional', accept: documentAccept },
];

export function NewAnalysisPage() {
  const queryClient = useQueryClient();
  const create = useCreateAnalysis();
  const rename = useUpdateAnalysis();
  const [, setLocation] = useLocation();
  const [files, setFiles] = useState<Partial<Record<FileRole, File>>>({});
  const [title, setTitle] = useState('');
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [error, setError] = useState('');
  const onFileChange = (role: FileRole, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError(`${file.name} is larger than the 10 MB limit.`);
      event.target.value = '';
      return;
    }
    setError('');
    setFiles((old) => ({ ...old, [role]: file }));
  };
  const removeFile = (role: FileRole) => setFiles((old) => {
    const next = { ...old };
    delete next[role];
    return next;
  });
  const sourceFile = files.courseSpecification;
  const canReview = !!sourceFile;
  const submit = () => {
    if (!sourceFile) { setError('Choose a course specification document to continue.'); return; }
    setError('');
    const data: AnalysisUpload = { courseSpecification: sourceFile };
    if (files.blueprint) data.blueprint = files.blueprint;
    if (files.template) data.template = files.template;
    if (files.outcomeDefinitions) data.outcomeDefinitions = files.outcomeDefinitions;
    if (files.institutionalRules) data.institutionalRules = files.institutionalRules;
    create.mutate({ data }, { onSuccess: async (analysis) => {
      try {
        const saved = title.trim()
          ? await rename.mutateAsync({ analysisId: analysis.id, data: { name: title.trim() } })
          : analysis;
        await Promise.all([queryClient.invalidateQueries({ queryKey: getGetAnalysesQueryKey() }), queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() })]);
        setLocation(`/analyses/${saved.id}`);
      } catch {
        setError('The analysis was created, but its label could not be saved.');
        setLocation(`/analyses/${analysis.id}`);
      }
    }, onError: (cause) => setError(
      cause instanceof Error && !/failed to fetch/i.test(cause.message)
        ? cause.message
        : 'Could not reach the analysis API. Start the API server on port 5000 and try again.',
    ) });
  };
  return <div className="fade-in mx-auto max-w-[920px]">
    <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 no-underline hover:text-indigo-700" data-testid="link-back-dashboard"><ArrowLeft size={15} />Back to overview</Link>
    <PageHeading eyebrow="New review" title="Bring the evidence together" description="Upload the course specification first. Add only the official documents you want this review to rely on." />
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3.5 text-xs leading-5 text-indigo-900"><ShieldCheck size={17} className="shrink-0 text-indigo-700" /><span><strong>Evidence stays in context.</strong> When no official template, outcome definitions, or rules are supplied, SpecForge will not treat a guess as institutional policy.</span></div>
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <div className={cx('grid h-7 w-7 place-items-center rounded-full text-xs font-bold', step === 'upload' ? 'bg-indigo-600 text-white' : 'bg-teal-100 text-teal-800')}>{step === 'upload' ? '1' : <Check size={14} />}</div>
        <div className="text-sm font-semibold text-slate-800">Source documents</div><div className="h-px flex-1 bg-slate-200" />
        <div className={cx('grid h-7 w-7 place-items-center rounded-full text-xs font-bold', step === 'review' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400')}>2</div><div className={cx('text-sm font-semibold', step === 'review' ? 'text-slate-800' : 'text-slate-400')}>Confirm before extraction</div>
      </div>
      {step === 'upload' ? <div className="p-5 md:p-7">
        <div className="grid gap-3 md:grid-cols-2">
          {uploadFields.map(({ role, label, help, required, accept }) => {
            const file = files[role];
            return <div key={role} className="flex items-stretch gap-2">
              <label className={cx('group relative min-w-0 flex-1 cursor-pointer rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-indigo-500', file ? 'border-teal-200 bg-teal-50/40' : role === 'courseSpecification' ? 'border-dashed border-indigo-300 bg-indigo-50/25 hover:bg-indigo-50/60' : 'border-dashed border-slate-200 bg-slate-50/55 hover:border-slate-300 hover:bg-slate-50')} data-testid={`upload-field-${role}`}>
                <input type="file" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" accept={accept} required={required} onChange={(event) => onFileChange(role, event)} data-testid={`input-file-${role}`} />
                <div className="flex items-start gap-3">
                  <div className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', file ? 'bg-teal-100 text-teal-800' : 'bg-white text-slate-500 shadow-sm')}><FileUp size={17} /></div>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-1 text-sm font-semibold text-slate-800">{label}{required && <span className="text-red-600">*</span>}</div><p className="mt-1 text-[11px] text-slate-500">{help}</p>{file && <p className="mt-2 truncate text-[11px] font-semibold text-teal-800">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}</div>
                  <span className="mt-1 text-[11px] font-semibold text-indigo-700">{file ? 'Replace' : 'Choose'}</span>
                </div>
              </label>
              {file && <button type="button" onClick={() => removeFile(role)} aria-label={`Remove ${label}`} className="self-center rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-700" data-testid={`button-remove-file-${role}`}><X size={16} /></button>}
            </div>;
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <p className="text-[11px] leading-5 text-slate-500">Documents are processed after you continue. No extracted values are inferred or displayed before the document is read.</p>
          <Button onClick={() => { if (canReview) { setError(''); setStep('review'); } else setError('Add a course specification document first.'); }} data-testid="button-review-sources">Review sources <ArrowRight size={15} /></Button>
        </div>
      </div> : <div className="p-5 md:p-7">
        <div className="mb-5"><label htmlFor="analysis-name" className="mb-1.5 block text-xs font-semibold text-slate-700">Analysis label <span className="font-normal text-slate-400">optional</span></label><input id="analysis-name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={sourceFile?.name.replace(/\.[^.]+$/, '') || 'Course review'} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" data-testid="input-analysis-name" /></div>
        <div className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 px-4 py-3"><div className="text-xs font-bold text-slate-800">Selected evidence</div><div className="mt-1 text-[11px] text-slate-500">Content extraction runs on submission. The original wording remains available in the review workspace.</div></div>
          <div className="divide-y divide-slate-100">{uploadFields.filter((f) => files[f.role]).map((field) => {
            const file = files[field.role]!;
            return <div key={field.role} className="flex items-center gap-3 px-4 py-3"><FileText size={16} className="text-slate-400" /><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-700">{roleNames[field.role]}</div><div className="mt-0.5 truncate text-[11px] text-slate-500">{file.name}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">{field.required ? 'Required' : 'Optional evidence'}</span></div>;
          })}</div>
        </div>
        {error && <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-800"><AlertCircle size={15} />{error}</div>}
        {(create.isPending || rename.isPending) && <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4"><div className="flex items-center gap-3"><LoaderCircle size={17} className="animate-spin text-indigo-700" /><div><div className="text-xs font-semibold text-indigo-900">Processing source documents</div><div className="mt-0.5 text-[11px] text-indigo-700">Extracting the supplied specification and evidence. This can take a moment.</div></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-indigo-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-indigo-500" /></div></div>}
        <div className="mt-5 flex flex-wrap justify-between gap-3"><Button variant="secondary" disabled={create.isPending || rename.isPending} onClick={() => { setStep('upload'); setError(''); }} data-testid="button-edit-sources"><ArrowLeft size={15} />Edit sources</Button><Button disabled={!sourceFile || create.isPending || rename.isPending} onClick={submit} data-testid="button-submit-analysis">{create.isPending || rename.isPending ? <><LoaderCircle size={15} className="animate-spin" />Extracting…</> : <><Upload size={15} />Create analysis</>}</Button></div>
      </div>}
    </Panel>
    <p className="mt-4 text-center text-[10px] leading-5 text-slate-400">A new analysis begins as a draft. Only a human reviewer can accept a suggested correction or mapping.</p>
  </div>;
}

function severityClass(severity: string) {
  if (severity === 'error') return 'bg-red-50 text-red-800 border-red-200';
  if (severity === 'warning') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export function AnalysisPage() {
  const { analysisId = '' } = useParams<{ analysisId: string }>();
  const analysisQuery = useGetAnalysis(analysisId, { query: { enabled: !!analysisId, queryKey: getGetAnalysisQueryKey(analysisId) } });
  const [tab, setTab] = useState<'overview' | 'findings' | 'mappings' | 'draft'>('overview');
  if (analysisQuery.isLoading) return <div className="mx-auto max-w-5xl"><div className="skeleton mb-5 h-4 w-32 rounded" /><div className="skeleton mb-4 h-10 w-80 rounded" /><div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-36 rounded-xl" /><div className="skeleton h-36 rounded-xl" /><div className="skeleton h-36 rounded-xl" /></div><div className="skeleton mt-5 h-72 rounded-xl" /></div>;
  if (analysisQuery.isError || !analysisQuery.data) return <div className="mx-auto max-w-xl py-20 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-700"><AlertCircle size={20} /></div><h1 className="mt-4 text-xl font-bold text-slate-900">Analysis unavailable</h1><p className="mt-2 text-sm text-slate-500">This analysis could not be loaded. It may have been removed, or the connection may be interrupted.</p><div className="mt-5 flex justify-center gap-2"><Button variant="secondary" onClick={() => analysisQuery.refetch()}><RefreshCw size={14} />Retry</Button><Link href="/" className="inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold text-indigo-700 no-underline">Back to overview</Link></div></div>;
  return <AnalysisWorkspace key={analysisQuery.data.id} analysis={analysisQuery.data} activeTab={tab} setTab={setTab} />;
}

function AnalysisWorkspace({ analysis, activeTab, setTab }: { analysis: Analysis; activeTab: 'overview' | 'findings' | 'mappings' | 'draft'; setTab: (tab: 'overview' | 'findings' | 'mappings' | 'draft') => void }) {
  const queryClient = useQueryClient();
  const update = useUpdateAnalysis();
  const mappings = useUpdateMapping();
  const [data, setData] = useState<CourseData>(analysis.courseData);
  const [notice, setNotice] = useState('');
  useEffect(() => { setData(analysis.courseData); }, [analysis.updatedAt, analysis.courseData]);
  const issueOpen = analysis.issues.filter((issue) => issue.status === 'pending').length;
  const acceptedMappings = data.mappings.filter((mapping) => mapping.status === 'accepted').length;
  const save = (courseData = data, extra: { correctedHtml?: string; unresolvedFields?: string[] } = {}) => update.mutate({ analysisId: analysis.id, data: { courseData, ...extra } }, {
    onSuccess: async () => { setNotice('Changes saved. Human approval remains a separate step.'); await Promise.all([queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(analysis.id) }), queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), queryClient.invalidateQueries({ queryKey: getGetAnalysesQueryKey() })]); },
    onError: () => setNotice('Changes could not be saved. Please try again.'),
  });
  const setCourseValue = (field: keyof CourseData, value: unknown) => setData((old) => ({ ...old, [field]: value }) as CourseData);
  const dirty = JSON.stringify(data) !== JSON.stringify(analysis.courseData);
  const prepareDraft = () => save(data);
  const downloadBlob = (filename: string, content: BlobPart, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadDraft = () => {
    if (dirty) { setNotice('Save course data first so the exported document reflects your latest edits.'); return; }
    if (!analysis.correctedHtml) { setNotice('Prepare the corrected draft before exporting.'); return; }
    downloadBlob(`${(analysis.courseCode || 'course').replace(/[^a-z0-9_-]/gi, '-')}-draft.html`, analysis.correctedHtml, 'text/html;charset=utf-8');
  };
  const downloadJsonReport = () => downloadBlob(`${(analysis.courseCode || 'course').replace(/[^a-z0-9_-]/gi, '-')}-validation-report.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: analysis.status,
    approvalsComplete: analysis.approvalsComplete,
    course: data,
    findings: analysis.issues,
    unresolvedFields: analysis.unresolvedFields,
    sourceFiles: analysis.sourceFiles.map(({ filename, role, fileType, status }) => ({ filename, role, fileType, status })),
    notice: 'Suggestions and reviewer decisions are not institutional approvals.',
  }, null, 2), 'application/json;charset=utf-8');
  const downloadMappingsCsv = () => {
    const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [
      ['Course outcome', 'Programme outcome', 'Score', 'Evidence', 'Review status'],
      ...data.mappings.map((mapping) => [mapping.courseOutcomeId, mapping.programmeOutcomeId, mapping.score, mapping.evidence, mapping.status]),
    ];
    downloadBlob(`${(analysis.courseCode || 'course').replace(/[^a-z0-9_-]/gi, '-')}-mapping.csv`, rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  const savePdf = () => {
    if (dirty) { setNotice('Save course data first so the PDF reflects your latest edits.'); return; }
    if (!analysis.correctedHtml) { setNotice('Prepare the corrected draft before printing.'); return; }
    const parsed = new DOMParser().parseFromString(analysis.correctedHtml, 'text/html');
    parsed.querySelectorAll('script,iframe,object,embed,form,base').forEach((element) => element.remove());
    parsed.querySelectorAll('*').forEach((element) => {
      [...element.attributes].forEach((attribute) => {
        if (/^on/i.test(attribute.name) || /^(?:javascript|vbscript):/i.test(attribute.value.trim())) element.removeAttribute(attribute.name);
      });
    });
    const policy = parsed.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
    parsed.head.prepend(policy);
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0';
    frame.srcdoc = `<!doctype html>${parsed.documentElement.outerHTML}`;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1500);
    };
    document.body.append(frame);
    setNotice('Use “Save as PDF” in the print dialog to download a PDF copy.');
  };
  const tabs = [{ id: 'overview' as const, label: 'Course data', count: data.outcomes.length }, { id: 'findings' as const, label: 'Findings', count: issueOpen }, { id: 'mappings' as const, label: 'CO–PO mapping', count: data.mappings.length }, { id: 'draft' as const, label: 'Corrected draft', count: analysis.unresolvedFields.length }];
  return <div className="fade-in">
    <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 no-underline hover:text-indigo-700" data-testid="link-workspace-back"><ArrowLeft size={15} />All analyses</Link>
    <PageHeading eyebrow={`${analysis.courseCode || 'Course'} · ${analysis.name}`} title={analysis.courseTitle || data.title || analysis.name} description="Review extracted values alongside their sources. Suggested corrections are never applied without a human decision." action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={prepareDraft} disabled={update.isPending || !dirty} data-testid="button-prepare-draft"><FileCheck2 size={15} />{update.isPending ? 'Saving…' : 'Refresh draft'}</Button><Button variant="secondary" onClick={downloadJsonReport} disabled={dirty} data-testid="button-export-json"><FileText size={15} />JSON report</Button><Button variant="secondary" onClick={downloadMappingsCsv} disabled={dirty} data-testid="button-export-csv"><ArrowDownToLine size={15} />CSV mappings</Button><Button variant="secondary" onClick={savePdf} disabled={dirty} data-testid="button-export-pdf">Save as PDF</Button><Button onClick={downloadDraft} disabled={dirty} data-testid="button-export-draft"><ArrowDownToLine size={15} />HTML draft</Button></div>} />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/75 px-4 py-3">
      <div className="flex items-center gap-2.5"><div className="grid h-7 w-7 place-items-center rounded-full bg-amber-100 text-amber-800"><AlertTriangle size={15} /></div><div><div className="text-xs font-bold text-amber-950">{analysis.approvalsComplete ? 'Approval record complete' : 'Draft · human review required'}</div><div className="mt-0.5 text-[11px] text-amber-900/80">{analysis.approvalsComplete ? 'Approval status is based on the recorded analysis data.' : 'A corrected document remains a draft until required approvals are complete.'}</div></div></div>
      <div className="rounded-full border border-amber-200 bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-amber-900">Suggestions are not approved</div>
    </div>
    {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-xs text-indigo-900"><CheckCircle2 size={15} />{notice}<button className="ml-auto" onClick={() => setNotice('')} aria-label="Dismiss status"><X size={14} /></button></div>}
     {dirty && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">Course data has unsaved edits. Save it before exporting the corrected document.</div>}
     <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <MetricCard label="Review findings" value={analysis.issues.length} note={`${issueOpen} still need a decision`} icon={AlertTriangle} tone="amber" />
      <MetricCard label="Course outcomes" value={data.outcomes.length} note="Extracted from the supplied course file" icon={GraduationCap} />
      <MetricCard label="Accepted mappings" value={`${acceptedMappings} / ${data.mappings.length}`} note="Accepted by reviewer, not institutionally approved" icon={ClipboardCheck} tone="teal" />
    </div>
     <Panel className="overflow-hidden">
      <div role="tablist" aria-label="Analysis review sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-2">
         {tabs.map((item) => <button key={item.id} role="tab" aria-selected={activeTab === item.id} onClick={() => setTab(item.id)} className={cx('flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors', activeTab === item.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')} data-testid={`tab-${item.id}`}>{item.label}<span className={cx('rounded-full px-1.5 py-0.5 text-[9px]', activeTab === item.id ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500')}>{item.count}</span></button>)}
      </div>
      {activeTab === 'overview' && <CourseDataPanel analysis={analysis} data={data} onChange={setCourseValue} onSave={() => save()} saving={update.isPending} />}
       {activeTab === 'findings' && <FindingsPanel analysis={analysis} onEditSource={() => setTab('overview')} />}
       {activeTab === 'mappings' && <MappingsPanel analysis={analysis} data={data} mutation={mappings} onSuccess={() => { queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(analysis.id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); }} />}
       {activeTab === 'draft' && <DraftPanel analysis={analysis} dirty={dirty} />}
    </Panel>
    <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] leading-5 text-slate-400"><ShieldCheck size={13} className="text-teal-700" />Source wording is retained in the extracted record. Official policy is considered only when supplied with this analysis.</div>
  </div>;
}

function CourseDataPanel({ analysis, data, onChange, onSave, saving }: { analysis: Analysis; data: CourseData; onChange: (field: keyof CourseData, value: unknown) => void; onSave: () => void; saving: boolean }) {
  const [editOutcome, setEditOutcome] = useState<string | null>(null);
  const [outcomeText, setOutcomeText] = useState('');
  const [editUnit, setEditUnit] = useState<string | null>(null);
  const [unitTitle, setUnitTitle] = useState('');
  const [unitHours, setUnitHours] = useState(0);
  const unitUpdates = (index: number, title: string, hours: number) => {
    const units = data.syllabusUnits.map((unit, current) => current === index ? { ...unit, title, hours } : unit);
    onChange('syllabusUnits', units);
    onChange('teachingHours', { ...data.teachingHours, syllabusTotal: units.reduce((total, unit) => total + unit.hours, 0) });
  };
  const outcomeUpdates = (index: number, patch: { text?: string; bloomLevel?: string | null }) => onChange('outcomes', data.outcomes.map((outcome, current) => current === index ? { ...outcome, ...patch } : outcome));
  return <div className="p-5 md:p-7">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="brand-font text-base font-bold text-slate-900">Extracted course data</h2><p className="mt-1 text-xs text-slate-500">Editable values stay traceable to the supplied documents.</p></div><Button onClick={onSave} disabled={saving} data-testid="button-save-course-data">{saving ? 'Saving…' : 'Save course data'}</Button></div>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Course title</span><input value={data.title} onChange={(e) => onChange('title', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" data-testid="input-course-title" /></label>
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Course code</span><input value={data.courseCode} onChange={(e) => onChange('courseCode', e.target.value)} className="mono w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" data-testid="input-course-code" /></label>
      <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Credits</span><input type="number" min="0" step=".5" value={data.credits ?? ''} onChange={(e) => onChange('credits', e.target.value === '' ? null : Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" data-testid="input-course-credits" /></label>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><div className="text-[11px] font-semibold text-slate-600">Institutional rules</div><div className="mt-1 flex items-center gap-1.5 text-xs">{data.institutionalRulesProvided ? <><CheckCircle2 size={14} className="text-teal-700" /><span className="text-teal-800">Evidence supplied</span></> : <><CircleHelp size={14} className="text-amber-600" /><span className="text-amber-800">Not supplied · no institutional rules assumed</span></>}</div></div>
    </div>
    <div className="mt-6 grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
      <section className="rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-xs font-bold text-slate-800">Teaching hours</h3><p className="mt-1 text-[10px] text-slate-500">Compare the extracted totals for consistency.</p></div>
        <div className="grid grid-cols-2 gap-3 p-4">
          {(['lecture', 'tutorial', 'practical'] as const).map((field) => <label key={field} className="text-[10px] font-semibold capitalize text-slate-500">{field}<input type="number" min="0" value={data.teachingHours[field]} onChange={(e) => onChange('teachingHours', { ...data.teachingHours, [field]: Number(e.target.value) })} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400" data-testid={`input-hours-${field}`} /></label>)}
          <div className="col-span-2 flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-[11px]"><span className="text-slate-500">Syllabus total</span><strong className="mono text-slate-800">{data.teachingHours.syllabusTotal} h</strong></div>
           <label className="col-span-2 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px]"><span className="text-slate-500">Summary total</span><input aria-label="Summary total hours" type="number" min="0" value={data.teachingHours.summaryTotal ?? ''} onChange={(e) => onChange('teachingHours', { ...data.teachingHours, summaryTotal: e.target.value === '' ? null : Number(e.target.value) })} className="mono w-24 rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs text-slate-800" data-testid="input-summary-hours" /></label>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-xs font-bold text-slate-800">Source documents</h3><p className="mt-1 text-[10px] text-slate-500">Files and extraction status</p></div>
        <div className="divide-y divide-slate-100">{analysis.sourceFiles.length ? analysis.sourceFiles.map((source) => <details key={source.id} className="group px-4 py-3"><summary className="flex cursor-pointer list-none items-center gap-2"><FileText size={15} className="text-slate-400" /><div className="min-w-0 flex-1"><div className="text-[11px] font-semibold text-slate-700">{roleNames[source.role] || source.role}</div><div className="truncate text-[10px] text-slate-400">{source.filename}</div></div><span className={cx('rounded-full px-2 py-1 text-[9px] font-semibold', source.status === 'processed' ? 'bg-teal-50 text-teal-800' : source.status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800')}>{source.status}</span><ChevronDown size={14} className="text-slate-400 transition-transform group-open:rotate-180" /></summary><pre className="scrollbar-thin mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[10px] leading-5 text-slate-600">{source.extractedText || 'No extracted text available.'}</pre></details>) : <div className="px-4 py-5 text-xs text-slate-400">No source file details available.</div>}</div>
      </section>
    </div>
    <div className="mt-6 rounded-xl border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h3 className="text-xs font-bold text-slate-800">Course outcomes</h3><p className="mt-1 text-[10px] text-slate-500">Preserve the course's original wording. Edit only when warranted.</p></div><span className="mono text-[10px] text-slate-400">{data.outcomes.length} outcomes</span></div>
       <div className="divide-y divide-slate-100">{data.outcomes.length ? data.outcomes.map((outcome, index) => { const outcomeKey = `${outcome.id}-${index}`; return <div key={outcomeKey} className="flex items-start gap-3 px-4 py-3.5" data-testid={`course-outcome-${outcomeKey}`}><span className="mono mt-0.5 rounded bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">{outcome.id}</span><div className="min-w-0 flex-1"><p className="text-xs leading-5 text-slate-700">{outcome.text}</p><label className="mt-2 flex items-center gap-2 text-[10px] font-medium text-slate-500">Bloom’s level<select value={outcome.bloomLevel ?? ''} onChange={(e) => outcomeUpdates(index, { bloomLevel: e.target.value || null })} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700" data-testid={`select-bloom-${outcomeKey}`}><option value="">Needs review</option>{['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'].map((level) => <option key={level} value={level}>{level}</option>)}</select></label>{editOutcome === outcomeKey && <div className="mt-2 flex gap-2"><textarea value={outcomeText} onChange={(e) => setOutcomeText(e.target.value)} rows={2} className="min-w-0 flex-1 rounded-md border border-indigo-200 p-2 text-xs outline-none focus:ring-2 focus:ring-indigo-100" aria-label={`Edit outcome ${outcome.id}`} /><Button className="min-h-8 px-2" onClick={() => { outcomeUpdates(index, { text: outcomeText }); setEditOutcome(null); }}>Save</Button><Button variant="quiet" className="min-h-8 px-2" onClick={() => setEditOutcome(null)}>Cancel</Button></div>}</div><button onClick={() => { setEditOutcome(editOutcome === outcomeKey ? null : outcomeKey); setOutcomeText(outcome.text); }} className="rounded-md px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50" data-testid={`button-edit-outcome-${outcomeKey}`}>{editOutcome === outcomeKey ? 'Close' : 'Edit'}</button></div>; }) : <p className="p-5 text-center text-xs text-slate-400">No course outcomes were extracted.</p>}</div>
    </div>
    <div className="mt-5 rounded-xl border border-slate-200">
      <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-xs font-bold text-slate-800">Syllabus units</h3></div>
       <div className="divide-y divide-slate-100">{data.syllabusUnits.length ? data.syllabusUnits.map((unit, index) => <div key={`${unit.id}-${index}`} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid={`syllabus-unit-${unit.id}-${index}`}><span className="mono grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] text-slate-500">{String(index + 1).padStart(2, '0')}</span>{editUnit === `${unit.id}-${index}` ? <><input value={unitTitle} onChange={(e) => setUnitTitle(e.target.value)} className="min-w-0 flex-1 rounded border border-indigo-200 px-2 py-1 text-xs" aria-label={`Edit unit ${unit.id}`} /><label className="flex items-center gap-1 text-[10px] text-slate-500">Hours<input type="number" min="0" value={unitHours} onChange={(e) => setUnitHours(Number(e.target.value))} className="w-16 rounded border border-slate-200 px-2 py-1 text-xs" aria-label={`Edit hours for unit ${unit.id}`} data-testid={`input-unit-hours-${index}`} /></label><Button className="min-h-7 px-2 text-[10px]" onClick={() => { unitUpdates(index, unitTitle, unitHours); setEditUnit(null); }}>Save</Button></> : <><div className="min-w-0 flex-1 text-xs font-medium text-slate-700">{unit.title}</div><span className="mono text-[10px] text-slate-500">{unit.hours} hrs</span><button onClick={() => { setUnitTitle(unit.title); setUnitHours(unit.hours); setEditUnit(`${unit.id}-${index}`); }} className="rounded-md px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50" data-testid={`button-edit-unit-${index}`}>Edit</button></>}</div>) : <p className="p-5 text-center text-xs text-slate-400">No syllabus units were extracted.</p>}</div>
    </div>
  </div>;
}

function FindingsPanel({ analysis, onEditSource }: { analysis: Analysis; onEditSource: () => void }) {
  const queryClient = useQueryClient();
  const review = useReviewIssue();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const issuesBySeverity = useMemo(() => ['error', 'warning', 'info'].flatMap((severity) => analysis.issues.filter((issue) => issue.severity === severity)), [analysis.issues]);
  const choose = (issue: ValidationIssue, status: 'accepted' | 'rejected' | 'deferred' | 'pending') => review.mutate({ analysisId: analysis.id, issueId: issue.id, data: { status, reviewerComment: comments[issue.id] || issue.reviewerComment || null } }, {
    onSuccess: async () => { setNotice(`Decision recorded: ${statusLabel(status)}.`); await Promise.all([queryClient.invalidateQueries({ queryKey: getGetAnalysisQueryKey(analysis.id) }), queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), queryClient.invalidateQueries({ queryKey: getGetAnalysesQueryKey() })]); },
    onError: () => setNotice('The review decision could not be saved. Please try again.'),
  });
  return <div className="p-5 md:p-7">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="brand-font text-base font-bold text-slate-900">Validation findings</h2><p className="mt-1 text-xs text-slate-500">Each suggestion is a prompt for review, not an approved correction.</p></div><div className="flex gap-2 text-[10px]">{['error', 'warning', 'info'].map((s) => <span key={s} className={cx('rounded-full border px-2 py-1 font-semibold capitalize', severityClass(s))}>{analysis.issues.filter((i) => i.severity === s).length} {s}</span>)}</div></div>
    {notice && <div role="status" className="mb-4 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-900">{notice}</div>}
    {issuesBySeverity.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-teal-50 text-teal-700"><CheckCircle2 size={21} /></div><h3 className="mt-3 text-sm font-bold text-slate-800">No validation findings</h3><p className="mt-1 text-xs text-slate-500">There are no findings to review. This is not a substitute for institutional approval.</p></div> : <div className="space-y-4">{issuesBySeverity.map((issue) => <article key={issue.id} className="overflow-hidden rounded-xl border border-slate-200" data-testid={`finding-${issue.id}`}>
      <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3.5"><span className={cx('mt-0.5 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wide', severityClass(issue.severity))}>{issue.severity}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-800">{issue.title}</h3><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500"><span className="mono">{issue.code}</span><span>Source: {issue.source || 'Not specified'}</span></div></div><span className={cx('rounded-full px-2.5 py-1 text-[10px] font-semibold', issue.status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600')}>{statusLabel(issue.status)}</span></div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_.9fr]">
        <div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Evidence and rationale</div><p className="mt-2 text-xs leading-5 text-slate-700">{issue.explanation}</p><blockquote className="mt-3 border-l-2 border-slate-300 pl-3 text-[11px] italic leading-5 text-slate-600">{issue.evidence || 'No supporting excerpt was supplied.'}</blockquote></div>
        <div className="space-y-2"><div className="rounded-lg border border-slate-200 p-3"><div className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">Original wording / value</div><p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">{issue.originalValue || 'Not available'}</p></div><div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3"><div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-amber-800"><Sparkles size={11} />Suggested value · not approved</div><p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-800">{issue.suggestedValue || 'No suggested value'}</p></div></div>
      </div>
      <div className="border-t border-slate-100 px-4 py-3">
        {activeComment === issue.id || issue.reviewerComment ? <textarea value={comments[issue.id] ?? issue.reviewerComment ?? ''} onChange={(e) => setComments((old) => ({ ...old, [issue.id]: e.target.value }))} placeholder="Add a reviewer note for the decision" rows={2} className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" data-testid={`input-review-comment-${issue.id}`} /> : null}
        {issue.reviewerComment && activeComment !== issue.id && <p className="mb-3 text-[11px] text-slate-500"><MessageSquareText size={12} className="mr-1 inline" />Reviewer note: {issue.reviewerComment}</p>}
         <div className="flex flex-wrap items-center justify-between gap-2"><button onClick={() => setActiveComment(activeComment === issue.id ? null : issue.id)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100" data-testid={`button-comment-${issue.id}`}><MessageSquareText size={13} />{issue.reviewerComment ? 'Edit note' : 'Add note'}</button>
           <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" className="min-h-8 px-2.5 text-[11px]" onClick={onEditSource} data-testid={`button-edit-source-${issue.id}`}>Edit course data</Button>{issue.status === 'pending' ? <><Button variant="secondary" className="min-h-8 px-2.5 text-[11px]" onClick={() => choose(issue, 'deferred')} disabled={review.isPending} data-testid={`button-defer-${issue.id}`}>Defer</Button><Button variant="danger" className="min-h-8 px-2.5 text-[11px]" onClick={() => choose(issue, 'rejected')} disabled={review.isPending} data-testid={`button-reject-${issue.id}`}><XCircle size={13} />Reject suggestion</Button><Button className="min-h-8 px-2.5 text-[11px]" onClick={() => choose(issue, 'accepted')} disabled={review.isPending} data-testid={`button-accept-${issue.id}`}><Check size={13} />Accept correction</Button></> : <Button variant="secondary" className="min-h-8 px-2.5 text-[11px]" onClick={() => choose(issue, 'pending')} disabled={review.isPending} data-testid={`button-reopen-${issue.id}`}>Reopen review</Button>}</div>
        </div>
      </div>
    </article>)}</div>}
  </div>;
}

function hasCompatibleMappingRubric(analysis: Analysis): boolean {
  const text = analysis.sourceFiles.find((file) => file.role === 'institutionalRules')?.extractedText;
  if (!text) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return false;
    const rubric = (parsed as Record<string, unknown>).mappingRubric;
    if (!rubric || typeof rubric !== 'object') return false;
    const values = rubric as Record<string, unknown>;
    const scores = [values.oneTerm, values.twoTerms, values.threeOrMoreTerms].map(Number);
    return scores.every((value) => Number.isInteger(value) && value >= 1 && value <= 3) &&
      scores[0] <= scores[1] && scores[1] <= scores[2];
  } catch {
    return false;
  }
}

function MappingsPanel({ analysis, data, mutation, onSuccess }: { analysis: Analysis; data: CourseData; mutation: ReturnType<typeof useUpdateMapping>; onSuccess: () => void }) {
  const [notice, setNotice] = useState('');
  const rubricCompatible = hasCompatibleMappingRubric(analysis);
  const updateMapping = (id: string, change: { status?: 'accepted' | 'rejected' | 'suggested'; score?: number; evidence?: string }) => mutation.mutate({ analysisId: analysis.id, mappingId: id, data: change }, {
    onSuccess: async () => { setNotice('Mapping decision saved. This is a reviewer decision, not institutional approval.'); onSuccess(); },
    onError: () => setNotice('Could not save the mapping decision. Try again.'),
  });
  const coText = (id: string) => data.outcomes.find((o) => o.id === id)?.text ?? 'Outcome not found';
  const poText = (id: string) => data.programmeOutcomes.find((o) => o.id === id);
  return <div className="p-5 md:p-7">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="brand-font text-base font-bold text-slate-900">CO–PO / PSO mapping</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Assess each proposed relationship against the outcome definitions supplied with this analysis. A score or accepted mapping is not an official approval.</p></div><span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-900">Reviewer decisions only</span></div>
    {notice && <div role="status" className="mb-4 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2.5 text-xs text-teal-900">{notice}</div>}
    {data.programmeOutcomes.length === 0 && <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><CircleHelp size={15} className="mt-0.5 shrink-0" />No official programme outcome definitions were included. Treat all mappings as provisional and verify against institutional documentation.</div>}
     {!rubricCompatible && <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900" data-testid="notice-mapping-rubric"><CircleHelp size={15} className="mt-0.5 shrink-0" />No compatible institutional mapping rubric was supplied. Scores 1–3 are unavailable; score 0 remains until the applicable rubric is provided.</div>}
    {!data.mappings.length ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-indigo-50 text-indigo-700"><GraduationCap size={21} /></div><h3 className="mt-3 text-sm font-bold text-slate-800">No mappings available</h3><p className="mt-1 text-xs text-slate-500">No CO–PO or CO–PSO suggestions were extracted from this analysis.</p></div> : <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[760px] text-left">
        <thead className="bg-slate-50"><tr className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500"><th className="px-4 py-3">Course outcome</th><th className="px-4 py-3">Programme outcome</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Review</th><th className="px-4 py-3">Decision</th></tr></thead>
        <tbody>{data.mappings.map((mapping) => {
          const po = poText(mapping.programmeOutcomeId);
          return <tr key={mapping.id} className="border-t border-slate-100 align-top" data-testid={`mapping-row-${mapping.id}`}>
            <td className="max-w-[230px] px-4 py-3"><div className="mono text-[10px] font-semibold text-indigo-700">{mapping.courseOutcomeId}</div><div className="mt-1 line-clamp-3 text-[10px] leading-4 text-slate-600">{coText(mapping.courseOutcomeId)}</div></td>
            <td className="max-w-[200px] px-4 py-3"><div className="flex items-center gap-1.5"><span className="mono text-[10px] font-semibold text-slate-700">{mapping.programmeOutcomeId}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-500">{po?.type ?? 'UNVERIFIED'}</span></div><div className="mt-1 text-[10px] font-semibold text-slate-700">{po?.title ?? 'Definition not supplied'}</div><div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{po?.description || 'No institutional definition available for comparison.'}</div></td>
             <td className="px-4 py-3"><label className="sr-only" htmlFor={`score-${mapping.id}`}>Mapping strength, 0 to 3</label><select id={`score-${mapping.id}`} value={mapping.score} onChange={(e) => updateMapping(mapping.id, { score: Number(e.target.value) })} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400" data-testid={`select-mapping-score-${mapping.id}`}>{[0, 1, 2, 3].map((n) => <option key={n} value={n} disabled={n > 0 && !rubricCompatible}>{n} · {['None', 'Low', 'Moderate', 'Strong'][n]}</option>)}</select></td>
            <td className="max-w-[200px] px-4 py-3"><textarea defaultValue={mapping.evidence} key={`${mapping.id}-${mapping.evidence}`} rows={2} onBlur={(e) => { if (e.target.value !== mapping.evidence) updateMapping(mapping.id, { evidence: e.target.value }); }} className="w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 text-[10px] leading-4 text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" aria-label={`Evidence for ${mapping.courseOutcomeId} to ${mapping.programmeOutcomeId}`} data-testid={`textarea-mapping-evidence-${mapping.id}`} /></td>
            <td className="px-4 py-3"><span className={cx('inline-flex rounded-full px-2 py-1 text-[9px] font-semibold', mapping.status === 'accepted' ? 'bg-teal-50 text-teal-800' : mapping.status === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800')}>{mapping.status === 'accepted' ? 'Accepted by reviewer' : mapping.status === 'rejected' ? 'Rejected' : 'Suggested'}</span></td>
            <td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => updateMapping(mapping.id, { status: 'accepted' })} aria-label="Accept mapping as reviewer" className={cx('rounded-md p-1.5 hover:bg-teal-50', mapping.status === 'accepted' ? 'bg-teal-50 text-teal-800' : 'text-slate-400')} data-testid={`button-accept-mapping-${mapping.id}`}><Check size={14} /></button><button onClick={() => updateMapping(mapping.id, { status: 'rejected' })} aria-label="Reject mapping suggestion" className={cx('rounded-md p-1.5 hover:bg-red-50', mapping.status === 'rejected' ? 'bg-red-50 text-red-700' : 'text-slate-400')} data-testid={`button-reject-mapping-${mapping.id}`}><X size={14} /></button><button onClick={() => updateMapping(mapping.id, { status: 'suggested' })} aria-label="Return mapping to suggested" className={cx('rounded-md p-1.5 hover:bg-amber-50', mapping.status === 'suggested' ? 'bg-amber-50 text-amber-800' : 'text-slate-400')} data-testid={`button-reset-mapping-${mapping.id}`}><RefreshCw size={13} /></button></div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-slate-500"><CircleHelp size={13} className="mt-0.5 shrink-0 text-slate-400" /><span>Mapping suggestions are for discussion and review. No mapping status on this page represents an institutional endorsement.</span></div>
  </div>;
}

function DraftPanel({ analysis, dirty }: { analysis: Analysis; dirty: boolean }) {
  return <div className="p-5 md:p-7">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="brand-font text-base font-bold text-slate-900">Corrected draft preview</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">The draft preserves the supplied template where supported. It is for review and does not mean the course or mappings are approved.</p>
      </div>
      <span className={cx('rounded-full border px-2.5 py-1 text-[10px] font-semibold', analysis.approvalsComplete ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-amber-200 bg-amber-50 text-amber-900')} data-testid="draft-status">{analysis.approvalsComplete ? 'Review decisions recorded' : 'Draft · review required'}</span>
    </div>
    {dirty && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900" role="status">There are unsaved edits. Save course data before this preview and its exports reflect your latest changes.</div>}
    {analysis.unresolvedFields.length > 0 && <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4" aria-labelledby="unresolved-heading">
      <h3 id="unresolved-heading" className="text-xs font-bold text-amber-950">Unresolved fields</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] leading-5 text-amber-900">{analysis.unresolvedFields.map((field, index) => <li key={`${field}-${index}`}>{field}</li>)}</ul>
    </section>}
    {analysis.correctedHtml ? <iframe
      title="Corrected course specification draft"
      srcDoc={analysis.correctedHtml}
      sandbox=""
      referrerPolicy="no-referrer"
      className="h-[720px] w-full rounded-xl border border-slate-200 bg-white"
      data-testid="iframe-corrected-draft"
    /> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-xs text-slate-500">No corrected draft has been generated yet.</div>}
  </div>;
}
