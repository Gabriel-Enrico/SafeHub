import { useEffect, useState, type SubmitEvent } from 'react';
import { apiBaseUrl, getCurrentAccessToken } from '../lib/supabase';

export type TaskDetails = {
  id: number;
  origem: 'projeto' | 'interacao';
  titulo: string;
  descricao?: string | null;
  solicitante_nome?: string | null;
  status: string;
  prioridade?: string | null;
  prazo?: string | null;
  cliente_id?: number | null;
  cliente_nome?: string | null;
  projeto_id?: number | null;
  projeto_nome?: string | null;
  equipe_id?: number | null;
  equipe_nome?: string | null;
  interacao_id?: number | null;
  responsavel_nome?: string | null;
  responsaveis_nomes?: string[];
};

type HistoryItem = {
  id: number;
  status_anterior: string | null;
  status_novo: string;
  criado_em: string;
  usuario_nome: string;
};

type CommentItem = {
  id: number;
  comentario: string;
  criado_em: string;
  usuario_nome: string;
};

type AttachmentItem = {
  id: number;
  nome_arquivo: string;
  tamanho_bytes: number;
  enviado_por_nome?: string;
};

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getCurrentAccessToken();
  const isMultipart =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined || isMultipart
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : `Falha HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

const statusLabels: Record<string, string> = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  bloqueada: 'Bloqueada',
  em_revisao: 'Em revisão',
  concluida: 'Concluída',
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatDeadline(value: string | null | undefined) {
  if (!value) return 'Sem prazo';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('pt-BR');
}

export default function TaskDetailsDialog({
  task,
  onClose,
}: {
  task: TaskDetails;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [commentsError, setCommentsError] = useState('');
  const [attachmentsError, setAttachmentsError] = useState('');
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [savingAttachment, setSavingAttachment] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !savingComment) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, savingComment]);

  useEffect(() => {
    let active = true;
    setHistory([]);
    setComments([]);
    setAttachments([]);
    setHistoryLoading(true);
    setCommentsLoading(true);
    setAttachmentsError('');
    const basePath = `/api/v1/tarefas/${task.origem}/${task.id}`;

    api<{ data: HistoryItem[] }>(`${basePath}/historico`)
      .then((result) => {
        if (active) setHistory(result.data ?? []);
      })
      .catch((cause) => {
        if (active)
          setHistoryError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar o histórico.'
          );
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    api<{ data: CommentItem[] }>(`${basePath}/comentarios`)
      .then((result) => {
        if (active) setComments(result.data ?? []);
      })
      .catch((cause) => {
        if (active)
          setCommentsError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar os comentários.'
          );
      })
      .finally(() => {
        if (active) setCommentsLoading(false);
      });

    const attachmentPath =
      task.origem === 'projeto'
        ? `/api/v1/tarefas/${task.id}/documentos`
        : task.cliente_id && task.interacao_id
          ? `/api/v1/clientes/${task.cliente_id}/documentos?interacao_id=${task.interacao_id}`
          : null;
    if (attachmentPath) {
      setAttachmentsLoading(true);
      api<{ data: AttachmentItem[] }>(attachmentPath)
        .then((result) => {
          if (active) setAttachments(result.data ?? []);
        })
        .catch((cause) => {
          if (active)
            setAttachmentsError(
              cause instanceof Error
                ? cause.message
                : 'Não foi possível carregar os anexos.'
            );
        })
        .finally(() => {
          if (active) setAttachmentsLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [task.id, task.origem, task.cliente_id, task.interacao_id]);

  async function saveComment(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = comment.trim();
    if (!text) return;
    setSavingComment(true);
    setCommentsError('');
    try {
      const created = await api<CommentItem>(
        `/api/v1/tarefas/${task.origem}/${task.id}/comentarios`,
        { method: 'POST', body: JSON.stringify({ comentario: text }) }
      );
      setComments((current) => [...current, created]);
      setComment('');
    } catch (cause) {
      setCommentsError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o comentário.'
      );
    } finally {
      setSavingComment(false);
    }
  }

  async function openAttachment(attachmentId: number) {
    try {
      const result = await api<{ url: string }>(
        `/api/v1/documentos/${attachmentId}/download`
      );
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setAttachmentsError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível abrir o anexo.'
      );
    }
  }

  async function uploadAttachment(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attachmentFile) return;
    const path =
      task.origem === 'projeto'
        ? `/api/v1/tarefas/${task.id}/documentos`
        : task.cliente_id && task.interacao_id
          ? `/api/v1/clientes/${task.cliente_id}/documentos?interacao_id=${task.interacao_id}`
          : null;
    if (!path) {
      setAttachmentsError(
        'Esta tarefa não possui uma interação para vincular o arquivo.'
      );
      return;
    }
    setSavingAttachment(true);
    setAttachmentsError('');
    try {
      const body = new FormData();
      body.append('file', attachmentFile);
      const created = await api<AttachmentItem>(path, { method: 'POST', body });
      setAttachments((current) => [created, ...current]);
      setAttachmentFile(null);
    } catch (cause) {
      setAttachmentsError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível anexar o arquivo.'
      );
    } finally {
      setSavingAttachment(false);
    }
  }

  const assignees = task.responsaveis_nomes?.length
    ? task.responsaveis_nomes.join(', ')
    : task.responsavel_nome || 'Sem responsável';

  return (
    <div
      className="modal-backdrop task-details-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !savingComment) onClose();
      }}
    >
      <section
        aria-labelledby="task-details-title"
        aria-modal="true"
        className="client-modal task-details-modal"
        role="dialog"
      >
        <header className="client-modal-heading">
          <div className="task-details-heading-copy">
            <span className="eyebrow">
              {task.origem === 'projeto'
                ? 'TAREFA DE PROJETO'
                : 'TAREFA DE CLIENTE'}
            </span>
            <div className="task-details-title-row">
              <h2 id="task-details-title">{task.titulo}</h2>
              <div className="task-details-status-row">
                <span className={`status-pill status-${task.status}`}>
                  {statusLabels[task.status] ??
                    task.status.replaceAll('_', ' ')}
                </span>
                {task.prioridade && (
                  <span className={`task-priority priority-${task.prioridade}`}>
                    {task.prioridade}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            aria-label="Fechar detalhes"
            className="modal-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <dl className="task-details-grid">
          <div>
            <dt>Responsável</dt>
            <dd>{assignees}</dd>
          </div>
          {task.solicitante_nome && (
            <div>
              <dt>Solicitante</dt>
              <dd>{task.solicitante_nome}</dd>
            </div>
          )}
          <div>
            <dt>Prazo</dt>
            <dd>{formatDeadline(task.prazo)}</dd>
          </div>
          {task.cliente_nome && (
            <div>
              <dt>Cliente</dt>
              <dd>{task.cliente_nome}</dd>
            </div>
          )}
          {task.projeto_nome && (
            <div>
              <dt>Projeto</dt>
              <dd>{task.projeto_nome}</dd>
            </div>
          )}
          {task.equipe_nome && (
            <div>
              <dt>Equipe</dt>
              <dd>{task.equipe_nome}</dd>
            </div>
          )}
          {task.interacao_id && (
            <div>
              <dt>Interação de origem</dt>
              <dd>#{task.interacao_id}</dd>
            </div>
          )}
        </dl>

        <section className="task-details-section">
          <h3>Descrição</h3>
          <p>{task.descricao?.trim() || 'Nenhuma descrição informada.'}</p>
        </section>

        <section className="task-details-section">
          <h3>Histórico</h3>
          {historyLoading ? (
            <p>Carregando histórico…</p>
          ) : historyError ? (
            <p className="task-details-error">{historyError}</p>
          ) : history.length === 0 ? (
            <p>Nenhuma alteração registrada.</p>
          ) : (
            <ol className="task-details-list">
              {history.map((item) => (
                <li key={item.id}>
                  <strong>
                    {item.status_anterior
                      ? `${statusLabels[item.status_anterior] ?? item.status_anterior} → `
                      : 'Criada em '}
                    {statusLabels[item.status_novo] ?? item.status_novo}
                  </strong>
                  <span>
                    {item.usuario_nome} · {formatDate(item.criado_em)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="task-details-section">
          <h3>Comentários</h3>
          {commentsLoading ? (
            <p>Carregando comentários…</p>
          ) : commentsError ? (
            <p className="task-details-error">{commentsError}</p>
          ) : comments.length === 0 ? (
            <p>Nenhum comentário registrado.</p>
          ) : (
            <ol className="task-details-list">
              {comments.map((item) => (
                <li key={item.id}>
                  <strong>{item.comentario}</strong>
                  <span>
                    {item.usuario_nome} · {formatDate(item.criado_em)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <form
            className="task-details-comment-form"
            onSubmit={(event) => void saveComment(event)}
          >
            <label htmlFor="task-details-comment">Adicionar comentário</label>
            <textarea
              id="task-details-comment"
              maxLength={5000}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              value={comment}
            />
            <button
              className="btn btn-primary"
              disabled={savingComment || !comment.trim()}
              type="submit"
            >
              {savingComment ? 'Enviando…' : 'Comentar'}
            </button>
          </form>
        </section>

        <section className="task-details-section task-details-attachments-section">
          <h3>Anexos</h3>
          {attachmentsLoading ? (
            <p>Carregando anexos…</p>
          ) : attachmentsError ? (
            <p className="task-details-error">{attachmentsError}</p>
          ) : attachments.length === 0 ? (
            <p>
              {task.origem === 'projeto'
                ? 'Nenhum anexo nesta tarefa.'
                : 'Nenhum anexo na interação de origem.'}
            </p>
          ) : (
            <ul className="task-details-attachments">
              {attachments.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.nome_arquivo} · {Math.ceil(item.tamanho_bytes / 1024)}{' '}
                    KB · {item.enviado_por_nome || 'Enviado recentemente'}
                  </span>
                  <button
                    className="table-action"
                    onClick={() => void openAttachment(item.id)}
                    type="button"
                  >
                    Abrir
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(task.origem === 'projeto' ||
            (task.cliente_id && task.interacao_id)) && (
            <form
              className="task-details-upload-form"
              onSubmit={(event) => void uploadAttachment(event)}
            >
              <label>
                Anexar arquivo
                <input
                  accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
                  onChange={(event) =>
                    setAttachmentFile(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />
              </label>
              <button
                className="table-action"
                disabled={savingAttachment || !attachmentFile}
                type="submit"
              >
                {savingAttachment ? 'Enviando…' : 'Enviar'}
              </button>
            </form>
          )}
        </section>
      </section>
    </div>
  );
}
