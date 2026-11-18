import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';

type OutlookStatus = {
  connected: boolean;
  status: string;
  connectedAt: string | null;
};
type OutlookCalendar = { id: string; name: string; owner?: { name?: string; address?: string }; canEdit?: boolean };
type OutlookEventLink = { id: number; vinculo_tipo: string; vinculo_id: number; nome: string };
type LinkOption = { id: number; nome?: string; titulo?: string; tipo?: string; origem?: string };

type OutlookEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  isAllDay?: boolean;
  attendees?: Array<{
    emailAddress: { address: string; name?: string };
    type: string;
  }>;
};

type EventForm = {
  subject: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  attendees: string;
};

type CalendarView = 'day' | 'week' | 'month';

const emptyStatus: OutlookStatus = {
  connected: false,
  status: 'desconectado',
  connectedAt: null,
};
const HOUR_HEIGHT = 52;
const FIRST_HOUR = 0;
const LAST_HOUR = 24;
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function apiUrl(path: string) {
  return `${apiBaseUrl.replace(/\/$/, '')}${path}`;
}

async function request<T>(accessToken: string, path: string, options: RequestInit = {}): Promise<T> {
  const currentToken = await getCurrentAccessToken();
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${currentToken}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String(payload.message)
      : `A API respondeu com HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

function parseGraphDate(value: string) {
  const hasZone = /(?:Z|[+-]\d\d:\d\d)$/i.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

function toLocalInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function graphDateToLocalInput(value: string) {
  const date = parseGraphDate(value);
  return Number.isNaN(date.getTime()) ? '' : toLocalInput(date);
}

function localInputToUtc(value: string) {
  return new Date(value).toISOString().slice(0, 19);
}

function formatTime(value: string) {
  return parseGraphDate(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatRangeDate(date: Date, options: Intl.DateTimeFormatOptions = {}) {
  return date.toLocaleDateString('pt-BR', options);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date) {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

function rangeFor(view: CalendarView, anchor: Date) {
  if (view === 'day') {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1) };
  }
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 7) };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = startOfWeek(first);
  return { start, end: addDays(startOfWeek(last), 7) };
}

function defaultForm(anchor = new Date()): EventForm {
  const start = new Date(anchor);
  const now = new Date();
  if (startOfDay(start).getTime() < startOfDay(now).getTime()) {
    start.setTime(now.getTime() + 60 * 60 * 1000);
  } else if (startOfDay(start).getTime() === startOfDay(now).getTime() && start <= now) {
    start.setTime(now.getTime() + 60 * 60 * 1000);
  }
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { subject: '', summary: '', start: toLocalInput(start), end: toLocalInput(end), location: '', attendees: '' };
}

function eventOverlapsDate(event: OutlookEvent, date: Date) {
  const start = parseGraphDate(event.start.dateTime);
  const end = parseGraphDate(event.end.dateTime);
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  return start < dayEnd && end > dayStart;
}

function eventsOnDate(events: OutlookEvent[], date: Date) {
  return events.filter((event) => eventOverlapsDate(event, date)).sort((a, b) =>
    parseGraphDate(a.start.dateTime).getTime() - parseGraphDate(b.start.dateTime).getTime()
  );
}

function monthDates(anchor: Date) {
  const range = rangeFor('month', anchor);
  return Array.from({ length: 42 }, (_, index) => addDays(range.start, index));
}

function toolbarLabel(view: CalendarView, anchor: Date) {
  if (view === 'day') return formatRangeDate(anchor, { day: 'numeric', month: 'long', year: 'numeric' });
  if (view === 'month') return `${MONTHS[anchor.getMonth()]} de ${anchor.getFullYear()}`;
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} de ${MONTHS[end.getMonth()]}, ${end.getFullYear()}`;
  }
  return `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}, ${end.getFullYear()}`;
}

export default function OutlookCalendarPanel({ accessToken }: { accessToken: string }) {
  const [status, setStatus] = useState(emptyStatus);
  const [events, setEvents] = useState<OutlookEvent[]>([]);
  const [calendars, setCalendars] = useState<OutlookCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [eventLinks, setEventLinks] = useState<OutlookEventLink[]>([]);
  const [availability, setAvailability] = useState<Array<{ scheduleId: string; availabilityView?: string; scheduleItems?: unknown[] }> | null>(null);
  const [linkType, setLinkType] = useState<'cliente' | 'contato' | 'interacao' | 'projeto' | 'tarefa_projeto' | 'tarefa_cliente'>('cliente');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkClientId, setLinkClientId] = useState('');
  const [linkClients, setLinkClients] = useState<LinkOption[]>([]);
  const [linkProjects, setLinkProjects] = useState<LinkOption[]>([]);
  const [linkContacts, setLinkContacts] = useState<LinkOption[]>([]);
  const [linkInteractions, setLinkInteractions] = useState<LinkOption[]>([]);
  const [linkTasks, setLinkTasks] = useState<LinkOption[]>([]);
  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [form, setForm] = useState<EventForm>(() => defaultForm());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);
  const minStart = toLocalInput(new Date());
  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId);
  const canEditSelectedCalendar = selectedCalendar?.canEdit !== false;

  const loadEvents = useCallback(async () => {
    const query = new URLSearchParams({
      startDateTime: range.start.toISOString(),
      endDateTime: range.end.toISOString(),
    });
    if (selectedCalendarId) query.set('calendarId', selectedCalendarId);
    const result = await request<{ value?: OutlookEvent[] }>(
      accessToken,
      `/api/v1/integracoes/outlook/events?${query}`
    );
    setEvents(result.value ?? []);
  }, [accessToken, range, selectedCalendarId]);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const nextStatus = await request<OutlookStatus>(accessToken, '/api/v1/integracoes/outlook/status');
      setStatus(nextStatus);
      if (nextStatus.connected) {
        const result = await request<{ value?: OutlookCalendar[] }>(accessToken, '/api/v1/integracoes/outlook/calendars');
        const available = result.value ?? [];
        setCalendars(available);
        setSelectedCalendarId((current) => current || available[0]?.id || '');
      } else {
        setEvents([]);
        setCalendars([]);
        setSelectedCalendarId('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar Outlook.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const callbackResult = new URLSearchParams(window.location.search).get('outlook');
    if (callbackResult === 'connected') {
      setNotice('Sua conta Outlook foi conectada.');
      window.history.replaceState({}, '', window.location.pathname);
    }
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status.connected) void loadEvents().catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar calendário.'));
  }, [status.connected, loadEvents]);

  useEffect(() => {
    if (!status.connected || !showForm) return;
    void Promise.all([
      request<{ data: Array<{ id: number; nome: string }> }>(accessToken, '/api/v1/clientes?limit=100&offset=0'),
      request<{ data: Array<{ id: number; nome: string }> }>(accessToken, '/api/v1/projetos'),
    ]).then(([clientResult, projectResult]) => {
      setLinkClients(clientResult.data ?? []);
      setLinkProjects(projectResult.data ?? []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar opções de vínculo.'));
  }, [accessToken, showForm, status.connected]);

  useEffect(() => {
    if (!linkClientId || !showForm || !['contato', 'interacao'].includes(linkType)) {
      setLinkContacts([]); setLinkInteractions([]); return;
    }
    void Promise.all([
      request<{ data: LinkOption[] }>(accessToken, `/api/v1/clientes/${linkClientId}/contatos`),
      request<{ data: LinkOption[] }>(accessToken, `/api/v1/clientes/${linkClientId}/interacoes`),
    ]).then(([contactResult, interactionResult]) => {
      setLinkContacts(contactResult.data ?? []); setLinkInteractions(interactionResult.data ?? []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar contatos e interações.'));
  }, [accessToken, linkClientId, linkType, showForm]);

  useEffect(() => {
    if (!showForm || !linkType.startsWith('tarefa_')) { setLinkTasks([]); return; }
    const query = new URLSearchParams({ visao: 'minhas', limit: '100', offset: '0' });
    void request<{ data: Array<{ id: number; titulo: string; origem: string }> }>(accessToken, `/api/v1/tarefas/quadro?${query}`)
      .then((result) => setLinkTasks((result.data ?? []).filter((task) => linkType === 'tarefa_projeto' ? task.origem === 'projeto' : task.origem === 'interacao').map((task) => ({ id: task.id, nome: task.titulo, origem: task.origem }))))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar tarefas.'));
  }, [accessToken, linkType, showForm]);

  function selectedCalendarQuery() {
    return selectedCalendarId ? `?calendarId=${encodeURIComponent(selectedCalendarId)}` : '';
  }

  async function loadEventLinks(eventId: string) {
    const query = selectedCalendarQuery();
    const result = await request<{ data: OutlookEventLink[] }>(accessToken,
      `/api/v1/integracoes/outlook/events/${encodeURIComponent(eventId)}/vinculos${query}`);
    setEventLinks(result.data ?? []);
  }

  async function addEventLink(eventId: string) {
    if (!linkTargetId) return;
    const targetId = linkType === 'cliente' ? linkClientId : linkType === 'projeto' ? linkTargetId : linkTargetId;
    if (!targetId) return;
    await request(accessToken,
      `/api/v1/integracoes/outlook/events/${encodeURIComponent(eventId)}/vinculos${selectedCalendarQuery()}`,
      { method: 'POST', body: JSON.stringify({ vinculo_tipo: linkType, vinculo_id: Number(targetId) }) });
    await loadEventLinks(eventId);
    setLinkTargetId('');
  }

  async function removeEventLink(linkId: number, eventId: string) {
    await request(accessToken,
      `/api/v1/integracoes/outlook/events/${encodeURIComponent(eventId)}/vinculos/${linkId}${selectedCalendarQuery()}`,
      { method: 'DELETE' });
    await loadEventLinks(eventId);
  }

  async function connect() {
    setIsSaving(true);
    setError('');
    try {
      const result = await request<{ authorizationUrl: string }>(
        accessToken,
        '/api/v1/integracoes/outlook/connect',
        { method: 'POST' }
      );
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao iniciar conexão.');
      setIsSaving(false);
    }
  }

  async function disconnect() {
    setIsSaving(true);
    setError('');
    try {
      await request(accessToken, '/api/v1/integracoes/outlook/connect', { method: 'DELETE' });
      setStatus(emptyStatus);
      setEvents([]);
      setCalendars([]);
      setSelectedCalendarId('');
      setEditingId(null);
      setShowForm(false);
      setForm(defaultForm(anchor));
      setNotice('A conexão Outlook foi removida do SafeHub.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao desconectar.');
    } finally {
      setIsSaving(false);
    }
  }

  async function submitEvent(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const start = new Date(form.start);
    const end = new Date(form.end);
    if (!Number.isFinite(start.getTime()) || start.getTime() < Date.now()) {
      setError('Escolha um início no presente ou no futuro.');
      return;
    }
    if (!Number.isFinite(end.getTime()) || end <= start) {
      setError('O horário de término precisa ser depois do início.');
      return;
    }
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      const body = {
        subject: form.subject.trim(),
        body: { contentType: 'Text' as const, content: form.summary.trim() },
        start: { dateTime: localInputToUtc(form.start), timeZone: 'UTC' },
        end: { dateTime: localInputToUtc(form.end), timeZone: 'UTC' },
        location: { displayName: form.location.trim() },
        attendees: form.attendees.split(',').map((address) => address.trim()).filter(Boolean)
          .map((address) => ({ emailAddress: { address }, type: 'required' as const })),
      };
      let savedEventId = editingId;
      if (editingId) {
        await request(accessToken, `/api/v1/integracoes/outlook/events/${encodeURIComponent(editingId)}${selectedCalendarQuery()}`, {
          method: 'PATCH', body: JSON.stringify(body),
        });
        setNotice('Evento atualizado.');
      } else {
        const created = await request<{ id?: string }>(accessToken, `/api/v1/integracoes/outlook/events${selectedCalendarQuery()}`, {
          method: 'POST', body: JSON.stringify(body),
        });
        savedEventId = created.id ?? null;
        setNotice('Evento criado.');
      }
      if (savedEventId && linkTargetId) await addEventLink(savedEventId);
      setEditingId(null);
      setShowForm(false);
      setForm(defaultForm(anchor));
      await loadEvents();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar evento.');
    } finally {
      setIsSaving(false);
    }
  }

  function editEvent(event: OutlookEvent) {
    setEditingId(event.id);
    setForm({
      subject: event.subject ?? '',
      summary: event.bodyPreview ?? '',
      start: graphDateToLocalInput(event.start.dateTime),
      end: graphDateToLocalInput(event.end.dateTime),
      location: event.location?.displayName ?? '',
      attendees: event.attendees?.map((attendee) => attendee.emailAddress.address).join(', ') ?? '',
    });
    setShowForm(true);
    setAvailability(null);
    void loadEventLinks(event.id).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar vínculos do evento.'));
    setNotice('');
  }

  async function removeEvent(eventId: string) {
    setIsSaving(true);
    setError('');
    try {
      await request(accessToken, `/api/v1/integracoes/outlook/events/${encodeURIComponent(eventId)}${selectedCalendarQuery()}`, {
        method: 'DELETE',
      });
      setEvents((current) => current.filter((event) => event.id !== eventId));
      if (editingId === eventId) {
        setEditingId(null);
        setShowForm(false);
        setForm(defaultForm(anchor));
      }
      setNotice('Evento excluído do Outlook.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao excluir evento.');
    } finally {
      setIsSaving(false);
    }
  }

  function shiftCalendar(direction: number) {
    setAnchor((current) => {
      const next = new Date(current);
      if (view === 'day') next.setDate(next.getDate() + direction);
      else if (view === 'week') next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction, 1);
      return next;
    });
  }

  function selectDate(date: Date, nextView: CalendarView = 'day') {
    setAnchor(startOfDay(date));
    setView(nextView);
  }

  function openNewEvent(date = anchor) {
    setEditingId(null);
    setForm(defaultForm(date));
    setShowForm(true);
    setEventLinks([]);
    setLinkTargetId('');
    setAvailability(null);
    setError('');
    setNotice('');
  }

  async function checkAvailability() {
    const emails = form.attendees.split(',').map((value) => value.trim()).filter(Boolean);
    if (!emails.length) { setError('Informe os e-mails dos participantes para consultar disponibilidade.'); return; }
    setIsSaving(true); setError(''); setAvailability(null);
    try {
      const result = await request<{ value?: Array<{ scheduleId: string; availabilityView?: string; scheduleItems?: unknown[] }> }>(accessToken, '/api/v1/integracoes/outlook/availability', {
        method: 'POST', body: JSON.stringify({ emails, startDateTime: new Date(form.start).toISOString(), endDateTime: new Date(form.end).toISOString() }),
      });
      setAvailability(result.value ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a disponibilidade.'); }
    finally { setIsSaving(false); }
  }

  function eventPosition(event: OutlookEvent, date: Date) {
    const dayStart = startOfDay(date).getTime();
    const start = Math.max(parseGraphDate(event.start.dateTime).getTime(), dayStart + FIRST_HOUR * 3_600_000);
    const end = Math.min(parseGraphDate(event.end.dateTime).getTime(), dayStart + LAST_HOUR * 3_600_000);
    const top = ((start - dayStart) / 3_600_000 - FIRST_HOUR) * HOUR_HEIGHT;
    const height = Math.max(22, ((end - start) / 3_600_000) * HOUR_HEIGHT);
    return { top, height };
  }

  function renderTimedCalendar(dates: Date[]) {
    const columns = `52px repeat(${dates.length}, minmax(95px, 1fr))`;
    return (
      <div className="cal-schedule-card">
        <div className="cal-headrow" style={{ gridTemplateColumns: columns }}>
          <div />
          {dates.map((date) => {
            const today = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
            return (
              <button className={`cal-daylbl${today ? ' today' : ''}`} key={date.toISOString()} onClick={() => selectDate(date)} type="button">
                <span className="dn">{WEEKDAYS[(date.getDay() + 6) % 7]}</span>
                <span className="dd">{date.getDate()}</span>
              </button>
            );
          })}
        </div>
        <div className="cal-all-day-row" style={{ gridTemplateColumns: columns }}>
          <span className="cal-all-day-label">Dia inteiro</span>
          {dates.map((date) => (
            <div className="cal-all-day-cell" key={date.toISOString()}>
              {eventsOnDate(events, date).filter((event) => event.isAllDay).map((event) => (
                <button className="cal-month-event" disabled={!canEditSelectedCalendar} key={event.id} onClick={() => editEvent(event)} type="button">{event.subject || 'Sem assunto'}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="cal-body-wrap">
          <div className="cal-body" style={{ gridTemplateColumns: columns }}>
            <div className="cal-hourcol">
              {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, index) => (
                <span key={index}>{String(FIRST_HOUR + index).padStart(2, '0')}:00</span>
              ))}
            </div>
            {dates.map((date) => {
              const today = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
              const visibleRangeStart = startOfDay(date).getTime() + FIRST_HOUR * 3_600_000;
              const visibleRangeEnd = startOfDay(date).getTime() + LAST_HOUR * 3_600_000;
              const dateEvents = eventsOnDate(events, date).filter((event) =>
                !event.isAllDay
                && parseGraphDate(event.start.dateTime).getTime() < visibleRangeEnd
                && parseGraphDate(event.end.dateTime).getTime() > visibleRangeStart
              );
              return (
                <div className={`cal-daycol${today ? ' today' : ''}`} key={date.toISOString()} style={{ height: HOUR_HEIGHT * (LAST_HOUR - FIRST_HOUR) }}>
                  {dateEvents.map((event) => {
                    const position = eventPosition(event, date);
                    const startHour = formatTime(event.start.dateTime);
                    const endHour = formatTime(event.end.dateTime);
                    return (
                      <button
                        className="cal-event"
                        disabled={!canEditSelectedCalendar}
                        key={event.id}
                        onClick={() => editEvent(event)}
                        style={{ top: position.top, height: position.height }}
                        title={`${event.subject || 'Sem assunto'} · ${startHour}–${endHour}`}
                        type="button"
                      >
                        <strong>{event.subject || 'Sem assunto'}</strong>
                        <span>{startHour} – {endHour}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderMonthCalendar() {
    return (
      <div className="cal-month-grid">
        {WEEKDAYS.map((day) => <div className="cal-month-weekday" key={day}>{day}</div>)}
        {monthDates(anchor).map((date) => {
          const outside = date.getMonth() !== anchor.getMonth();
          const today = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
          const dateEvents = eventsOnDate(events, date);
          return (
            <div className={`cal-month-cell${outside ? ' other' : ''}${today ? ' today' : ''}`} key={date.toISOString()}>
              <button className="cal-month-date" onClick={() => selectDate(date)} type="button">{date.getDate()}</button>
              <div className="cal-month-events">
                {dateEvents.slice(0, 3).map((event) => (
                  <button className="cal-month-event" disabled={!canEditSelectedCalendar} key={event.id} onClick={() => editEvent(event)} type="button">
                    {!event.isAllDay && <time>{formatTime(event.start.dateTime)}</time>} {event.subject || 'Sem assunto'}
                  </button>
                ))}
                {dateEvents.length > 3 && <span className="cal-more-events">+{dateEvents.length - 3} eventos</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const miniDates = monthDates(anchor);
  const miniRows = Array.from({ length: 6 }, (_, row) => miniDates.slice(row * 7, row * 7 + 7));

  return (
    <section className="outlook-panel cal-app">
      <div className="outlook-panel-heading">
        <div>
          <span className="eyebrow">LINHA DO TEMPO</span>
          <h2>Agenda</h2>
          <p>Reuniões e compromissos da sua conta Outlook.</p>
        </div>
        <div className="cal-heading-actions">
          {status.connected && <span className="outlook-connected-badge">Conectado</span>}
          {status.connected && <button className="btn btn-primary" disabled={isSaving || !canEditSelectedCalendar} onClick={() => openNewEvent()} title={!canEditSelectedCalendar ? 'Você tem acesso somente para visualização neste calendário.' : undefined} type="button">＋ Nova reunião</button>}
        </div>
      </div>

      {error && <p className="outlook-message outlook-error" role="alert">{error}</p>}
      {notice && <p className="outlook-message outlook-success" role="status">{notice}</p>}

      {isLoading ? <p className="cal-loading">Carregando agenda…</p> : !status.connected ? (
        <div className="outlook-connect-row">
          <p>{status.status === 'reautorizacao_necessaria'
            ? 'A autorização expirou ou foi revogada. Conecte novamente para continuar.'
            : 'Conecte sua conta para visualizar e administrar seus eventos.'}</p>
          <button className="primary-button" disabled={isSaving} onClick={() => void connect()} type="button">
            {isSaving ? 'Abrindo Microsoft…' : 'Conectar Outlook'}
          </button>
        </div>
      ) : (
        <>
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button aria-label="Período anterior" className="icon-btn" disabled={isSaving} onClick={() => shiftCalendar(-1)} type="button">‹</button>
              <button aria-label="Próximo período" className="icon-btn" disabled={isSaving} onClick={() => shiftCalendar(1)} type="button">›</button>
            </div>
            <button className="btn btn-ghost cal-today" onClick={() => setAnchor(startOfDay(new Date()))} type="button">Hoje</button>
            <span className="cal-range">{toolbarLabel(view, anchor)}</span>
            {calendars.length > 0 && (
              <label className="cal-calendar-select">Calendário
                <select aria-label="Selecionar calendário Outlook" onChange={(event) => setSelectedCalendarId(event.target.value)} value={selectedCalendarId}>
                  <option value="">Minha agenda padrão</option>
                  {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.owner?.name ? ` · ${calendar.owner.name}` : ''}</option>)}
                </select>
              </label>
            )}
            <div aria-label="Modo de visualização" className="cal-view-toggle" role="group">
              {(['day', 'week', 'month'] as const).map((option) => (
                <button className={`chip${view === option ? ' active' : ''}`} key={option} onClick={() => setView(option)} type="button">
                  {option === 'day' ? 'Dia' : option === 'week' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
            <button className="icon-btn cal-refresh" aria-label="Atualizar agenda" disabled={isSaving} onClick={() => void loadStatus()} type="button">↻</button>
          </div>

          <div className="cal-shell">
            <aside className="cal-sidebar">
              <div className="cal-mini-card">
                <div className="cal-mini-heading">
                  <strong>{MONTHS[anchor.getMonth()]} {anchor.getFullYear()}</strong>
                  <span>
                    <button aria-label="Mês anterior" onClick={() => setAnchor((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} type="button">‹</button>
                    <button aria-label="Próximo mês" onClick={() => setAnchor((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} type="button">›</button>
                  </span>
                </div>
                <table className="mini-cal">
                  <thead><tr>{['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, index) => <th key={`${day}-${index}`}>{day}</th>)}</tr></thead>
                  <tbody>{miniRows.map((row, index) => (
                    <tr key={index}>{row.map((date) => {
                      const today = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
                      const selected = startOfDay(date).getTime() === startOfDay(anchor).getTime();
                      return <td key={date.toISOString()}><button className={`${date.getMonth() !== anchor.getMonth() ? 'other ' : ''}${today ? 'today ' : ''}${selected ? 'selected' : ''}`} onClick={() => selectDate(date)} type="button">{date.getDate()}</button></td>;
                    })}</tr>
                  ))}</tbody>
                </table>
                <div className="cal-legend"><span><i /> Minha agenda Outlook</span></div>
              </div>
              <div className="cal-sidebar-footer">
                <button className="outlook-disconnect" disabled={isSaving} onClick={() => void disconnect()} type="button">Desconectar Outlook</button>
              </div>
            </aside>

            <div className="cal-main-view">
              {view === 'month' ? renderMonthCalendar() : renderTimedCalendar(
                view === 'day' ? [startOfDay(anchor)] : Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchor), index))
              )}
            </div>
          </div>
          {events.length === 0 && <p className="outlook-empty cal-empty">Nenhum evento encontrado neste período.</p>}
        </>
      )}

      {showForm && (
        <div className="cal-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setShowForm(false); }}>
          <form className="cal-event-form" onSubmit={(event) => void submitEvent(event)}>
            <div className="cal-form-heading">
              <div><span className="eyebrow">AGENDA OUTLOOK</span><h3>{editingId ? 'Editar reunião' : 'Nova reunião'}</h3></div>
              <button aria-label="Fechar" className="icon-btn" onClick={() => setShowForm(false)} type="button">×</button>
            </div>
            <label>Assunto<input maxLength={255} onChange={(event) => setForm({ ...form, subject: event.target.value })} required value={form.subject} /></label>
            <div className="cal-form-dates">
              <label>Início<input min={minStart} onChange={(event) => setForm({ ...form, start: event.target.value })} required type="datetime-local" value={form.start} /></label>
              <label>Fim<input min={form.start || minStart} onChange={(event) => setForm({ ...form, end: event.target.value })} required type="datetime-local" value={form.end} /></label>
            </div>
            <label>Localização<input maxLength={255} onChange={(event) => setForm({ ...form, location: event.target.value })} value={form.location} /></label>
            <label>Participantes <span className="cal-label-hint">e-mails separados por vírgula</span><input maxLength={2000} onChange={(event) => setForm({ ...form, attendees: event.target.value })} placeholder="pessoa@empresa.com" value={form.attendees} /></label>
            <button className="btn btn-ghost" disabled={isSaving || !form.start || !form.end} onClick={() => void checkAvailability()} type="button">Consultar disponibilidade</button>
            {availability && <div className="cal-availability" role="status">{availability.map((item) => <p key={item.scheduleId}><strong>{item.scheduleId}</strong>: {item.scheduleItems?.length ? `${item.scheduleItems.length} compromisso(s) no horário` : 'sem conflitos no horário consultado'}</p>)}</div>}
            <label>Resumo / miniata<textarea maxLength={20000} onChange={(event) => setForm({ ...form, summary: event.target.value })} rows={4} value={form.summary} /></label>
            <fieldset className="cal-event-links">
              <legend>Vincular ao SafeHub</legend>
              <div className="cal-form-dates">
                <label>Tipo
                  <select onChange={(event) => { setLinkType(event.target.value as typeof linkType); setLinkTargetId(''); }} value={linkType}>
                    <option value="cliente">Cliente</option><option value="contato">Contato</option><option value="interacao">Interação / miniata</option><option value="projeto">Projeto</option><option value="tarefa_projeto">Tarefa de projeto</option><option value="tarefa_cliente">Tarefa de cliente</option>
                  </select>
                </label>
                {!['projeto','tarefa_projeto','tarefa_cliente'].includes(linkType) && <label>Cliente
                  <select onChange={(event) => { setLinkClientId(event.target.value); setLinkTargetId(event.target.value); }} value={linkClientId}>
                    <option value="">Selecione um cliente</option>{linkClients.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                  </select>
                </label>}
              </div>
              {(linkType === 'contato' || linkType === 'interacao' || linkType === 'projeto' || linkType.startsWith('tarefa_')) && <label>{linkType === 'contato' ? 'Contato' : linkType === 'interacao' ? 'Interação' : linkType === 'projeto' ? 'Projeto' : 'Tarefa'}
                <select onChange={(event) => setLinkTargetId(event.target.value)} value={linkTargetId}>
                  <option value="">Selecione…</option>
                  {(linkType === 'contato' ? linkContacts : linkType === 'interacao' ? linkInteractions : linkType === 'projeto' ? linkProjects : linkTasks).map((item) => <option key={item.id} value={item.id}>{item.nome ?? item.titulo ?? item.tipo ?? `Registro ${item.id}`}</option>)}
                </select>
              </label>}
              {editingId && <button className="btn btn-ghost" disabled={!linkTargetId || isSaving} onClick={() => void addEventLink(editingId).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível vincular o registro.'))} type="button">＋ Adicionar vínculo</button>}
              {eventLinks.length > 0 && <ul>{eventLinks.map((item) => <li key={item.id}>{item.nome}<button aria-label={`Remover vínculo ${item.nome}`} disabled={isSaving || !editingId} onClick={() => editingId && void removeEventLink(item.id, editingId).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível remover o vínculo.'))} type="button">×</button></li>)}</ul>}
              {!editingId && <small>O vínculo escolhido será criado junto com a reunião.</small>}
            </fieldset>
            <div className="cal-form-actions">
              {editingId && <button className="danger-button" disabled={isSaving} onClick={() => void removeEvent(editingId)} type="button">Excluir reunião</button>}
              <button className="btn btn-ghost" disabled={isSaving} onClick={() => setShowForm(false)} type="button">Cancelar</button>
              <button className="btn btn-primary" disabled={isSaving} type="submit">{isSaving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar reunião'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
