import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Bot, MessageSquarePlus, Send, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { authApi, authMessage } from '@/features/auth/auth-api';
import { Button } from '@/components/ui/button';
import { PageHeader, LoadingState } from '@/components/shared/DashboardComponents';
import { AiResponse, AiThinking } from './AiResponse';
import './ai.css';
type Status = {
  ready: boolean;
  enabled: boolean;
  configured: boolean;
  model: string | null;
  reason: string | null;
  pending?: { conversationId: string; createdAt: string } | null;
};
type Conversation = { id: string; title: string; updatedAt: string };
type Source = { label: string; path: string };
type Message = {
  id: string;
  requestKey?: string;
  question: string;
  answer: string | null;
  status: string;
  createdAt: string;
  errorCode: string | null;
  sources: Source[] | null;
};
const suggestions = [
  'Quais leads estão em negociação?',
  'Quais contratos vencem neste mês?',
  'Quanto recebemos este mês?',
  'Quais metas estão atrasadas?',
  'Qual a economia estimada nas propostas?',
  'Quais clientes precisam de acompanhamento?',
];
function errorMessage(e: unknown) {
  if (axios.isAxiosError(e)) {
    if (e.response?.status === 503)
      return 'A VYMPAI está temporariamente indisponível. Tente novamente em alguns minutos.';
    if (e.response?.status === 504)
      return 'A VYMPAI demorou a responder. Aguarde antes de tentar novamente.';
    if (e.response?.status === 502)
      return 'Não foi possível concluir a resposta da VYMPAI. Tente novamente em alguns minutos.';
  }
  if (
    axios.isAxiosError(e) &&
    typeof e.response?.data?.message === 'string' &&
    [400, 409, 429, 502, 503, 504].includes(e.response.status)
  )
    return e.response.data.message;
  return authMessage(e);
}
export function AiPage() {
  const qc = useQueryClient(),
    input = useRef<HTMLTextAreaElement>(null),
    sendLock = useRef(false),
    scrollArea = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    controller = useRef<AbortController | null>(null),
    [pending, setPending] = useState<{ question: string; requestKey: string } | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [question, setQuestion] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [listPage, setListPage] = useState(1),
    [messagePage, setMessagePage] = useState(1);
  const state = useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => authApi<Status>('/ai/status'),
    retry: false,
    refetchInterval: (q) => (q.state.data?.pending || busy ? 2000 : 30000),
  });
  const list = useQuery({
    queryKey: ['ai', 'conversations', listPage],
    queryFn: () =>
      authApi<{ items: Conversation[]; total: number }>('/ai/conversations?page=' + listPage),
    retry: false,
  });
  const messages = useQuery({
    queryKey: ['ai', 'messages', selected, messagePage],
    queryFn: () =>
      authApi<{ items: Message[]; total: number }>(
        '/ai/conversations/' + selected + '/messages?page=' + messagePage,
      ),
    enabled: !!selected,
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.items.some((m) => m.status === 'PENDING') ? 5000 : false,
  });
  const processing =
    busy || !!state.data?.pending || !!messages.data?.items.some((m) => m.status === 'PENDING');
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (follow.current && scrollArea.current)
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [messages.data, pending, selected]);
  function choose(id: string | null) {
    if (busy) return;
    follow.current = true;
    setSelected(id);
    setMessagePage(1);
    setQuestion('');
    setError('');
  }
  async function removeConversation(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await authApi('/ai/conversations/' + id, 'DELETE');
      if (selected === id) {
        setSelected(null);
        setQuestion('');
        setMessagePage(1);
      }
      qc.removeQueries({ queryKey: ['ai', 'messages', id] });
      if (list.data?.items.length === 1 && listPage > 1) setListPage(listPage - 1);
      await qc.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    const text = question.trim();
    if (sendLock.current || processing || !state.data?.ready || text.length < 2) return;
    sendLock.current = true;
    controller.current = new AbortController();
    const requestKey = crypto.randomUUID();
    setPending({ question: text, requestKey });
    follow.current = true;
    setBusy(true);
    setError('');
    let id = selected;
    try {
      if (!id) {
        const c = await authApi<Conversation>('/ai/conversations', 'POST', {
          title: text.slice(0, 120),
        });
        id = c.id;
        setSelected(id);
        setMessagePage(1);
      }
      await authApi<Message>(
        '/ai/conversations/' + id + '/messages',
        'POST',
        { question: text, requestKey },
        true,
        65000,
        controller.current.signal,
      );
      setQuestion('');
      setMessagePage(1);
    } catch (e) {
      setError(
        axios.isCancel(e)
          ? 'Espera interrompida. A resposta poderá aparecer no histórico.'
          : errorMessage(e),
      );
    } finally {
      try {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['ai', 'messages', id] }),
          qc.invalidateQueries({ queryKey: ['ai', 'conversations'] }),
          qc.invalidateQueries({ queryKey: ['ai', 'status'] }),
        ]);
      } finally {
        setPending(null);
        sendLock.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section className="dashboard-page ai-page">
      <PageHeader
        title={
          <span className="ai-brand">
            VYMP<span>AI</span>
          </span>
        }
        description="Consulte informações do seu workspace e organize os próximos passos com clareza."
      >
        <span className="ai-readonly">
          <ShieldCheck size={15} /> Somente leitura
        </span>
      </PageHeader>
      <div className="ai-notice">
        <Sparkles size={17} />
        <p>
          Respostas consultivas com dados autorizados. A assistente não altera cadastros, contratos,
          preços, metas ou pagamentos. Recomendações não são executadas.
        </p>
      </div>
      {state.isError && (
        <p role="alert" className="ai-error">
          {errorMessage(state.error)}
        </p>
      )}
      {state.data && !state.data.ready && (
        <div className="ai-configuration" role="status">
          <strong>
            {!state.data.configured ? 'VYMPAI ainda não configurada' : 'VYMPAI desativada'}
          </strong>
          <p>
            {state.data.reason} A configuração é feita somente no servidor. Os demais módulos
            continuam disponíveis.
          </p>
          <Button variant="outline" onClick={() => void state.refetch()}>
            Verificar configuração
          </Button>
        </div>
      )}
      {state.data?.pending && !busy && (
        <div className="ai-configuration" role="status">
          <p>
            Uma pergunta ainda está sendo processada. Aguarde a conclusão antes de enviar outra.
          </p>
          {state.data.pending.conversationId !== selected && (
            <Button
              type="button"
              variant="outline"
              onClick={() => choose(state.data!.pending!.conversationId)}
            >
              Abrir conversa em processamento
            </Button>
          )}
        </div>
      )}
      <div className="ai-workspace">
        <aside className="ai-sidebar">
          <Button className="ai-new" disabled={busy} onClick={() => choose(null)}>
            <MessageSquarePlus size={16} /> Nova conversa
          </Button>
          <h2>Suas conversas</h2>
          {list.isPending ? (
            <span>Carregando histórico…</span>
          ) : list.isError ? (
            <p role="alert">{errorMessage(list.error)}</p>
          ) : (
            <>
              <div className="ai-conversations">
                {list.data.items.map((c) => (
                  <div className="ai-conversation-row" key={c.id}>
                    <button
                      className={selected === c.id ? 'selected' : ''}
                      disabled={busy}
                      onClick={() => choose(c.id)}
                    >
                      <span>{c.title}</span>
                      <small>{new Date(c.updatedAt).toLocaleDateString('pt-BR')}</small>
                    </button>
                    <button
                      type="button"
                      className="ai-delete-conversation"
                      aria-label={'Excluir conversa: ' + c.title}
                      title="Excluir conversa"
                      disabled={busy}
                      onClick={() => void removeConversation(c.id)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                {!list.data.items.length && <p>Nenhuma conversa salva.</p>}
              </div>
              <div className="ai-pagination">
                <Button
                  variant="ghost"
                  disabled={listPage <= 1 || busy}
                  onClick={() => setListPage(listPage - 1)}
                >
                  Anterior
                </Button>
                <span>{listPage}</span>
                <Button
                  variant="ghost"
                  disabled={listPage * 20 >= list.data.total || busy}
                  onClick={() => setListPage(listPage + 1)}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </aside>
        <div className="ai-chat">
          <div className="ai-chat-heading">
            <Bot size={20} />
            <div>
              <strong>Assistente administrativa</strong>
              <span>
                {state.data?.ready
                  ? `Modelo ${state.data.model?.replace(/^gemini-/, '') ?? 'não definido'} · consultas autorizadas`
                  : 'Aguardando configuração'}
              </span>
            </div>
          </div>
          <div
            className="ai-messages"
            ref={scrollArea}
            onScroll={() => {
              const el = scrollArea.current;
              if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
            }}
            aria-live="polite"
            aria-busy={!!pending}
          >
            {!selected && !pending && (
              <div className="ai-welcome">
                <span className="ai-welcome-icon">
                  <Sparkles size={28} />
                </span>
                <h2>Como posso ajudar?</h2>
                <p>
                  Pergunte sobre o CRM, clientes, contratos, propostas e metas. Dados financeiros
                  seguem suas permissões.
                </p>
                <div className="ai-suggestions">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      disabled={processing || !state.data?.ready}
                      onClick={() => {
                        setQuestion(s);
                        input.current?.focus();
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <small>
                  Ao enviar uma pergunta com a IA habilitada, a mensagem e os dados necessários à
                  consulta serão processados pelo provedor de IA da VYMPAI.
                </small>
              </div>
            )}
            {selected &&
              (messages.isPending && !pending ? (
                <LoadingState />
              ) : messages.isError ? (
                <p role="alert" className="ai-error">
                  {errorMessage(messages.error)}
                </p>
              ) : (
                <>
                  {messages.data?.items.map((m) => (
                    <article className="ai-exchange" key={m.id}>
                      <div className="ai-question">
                        <span>Você</span>
                        <p>{m.question}</p>
                      </div>
                      <div className="ai-answer">
                        <span>
                          <Bot size={15} />{' '}
                          <span className="ai-brand">
                            VYMP<span>AI</span>
                          </span>
                        </span>
                        {m.status === 'COMPLETED' ? (
                          <>
                            <AiResponse text={m.answer ?? ''} />
                            {!!m.sources?.length && (
                              <nav aria-label="Fontes consultadas">
                                {m.sources
                                  .filter((s) =>
                                    [
                                      '/crm',
                                      '/clients',
                                      '/contracts',
                                      '/finance/management',
                                      '/finance/simulator',
                                      '/goals',
                                    ].includes(s.path),
                                  )
                                  .map((s) => (
                                    <Link key={s.path} to={s.path}>
                                      {s.label}
                                    </Link>
                                  ))}
                              </nav>
                            )}
                          </>
                        ) : m.status === 'PENDING' ? (
                          <AiThinking />
                        ) : (
                          <p className="ai-failed">
                            Não foi possível concluir esta resposta. Você pode enviar uma nova
                            pergunta.
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                  {!messages.data?.items.length && !busy && (
                    <p className="ai-empty">Esta conversa ainda não tem perguntas.</p>
                  )}
                  {(messages.data?.total ?? 0) > 20 && (
                    <div className="ai-pagination">
                      <Button
                        variant="outline"
                        disabled={messagePage <= 1 || busy}
                        onClick={() => setMessagePage(messagePage - 1)}
                      >
                        Mais recentes
                      </Button>
                      <span>Página {messagePage}</span>
                      <Button
                        variant="outline"
                        disabled={messagePage * 20 >= (messages.data?.total ?? 0) || busy}
                        onClick={() => setMessagePage(messagePage + 1)}
                      >
                        Mais antigas
                      </Button>
                    </div>
                  )}
                </>
              ))}
            {pending && !messages.data?.items.some((m) => m.requestKey === pending.requestKey) && (
              <article className="ai-exchange" data-testid="optimistic-exchange">
                <div className="ai-question">
                  <span>Você</span>
                  <p>{pending.question}</p>
                </div>
                <div className="ai-answer">
                  <span>
                    <Bot size={15} /> VYMPAI
                  </span>
                  <AiThinking />
                </div>
              </article>
            )}
          </div>
          <form
            className="ai-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="ai-question">Sua pergunta</label>
            <textarea
              ref={input}
              id="ai-question"
              placeholder={
                state.data?.ready
                  ? 'Pergunte sobre os dados do workspace…'
                  : 'Configure a VYMPAI no servidor para começar.'
              }
              value={question}
              maxLength={2000}
              disabled={processing || !state.data?.ready}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="ai-compose-actions">
              <span>{question.length}/2000 · Enter envia; Shift+Enter quebra linha</span>
              <Button
                type="submit"
                disabled={processing || !state.data?.ready || question.trim().length < 2}
              >
                {busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Enviar
                pergunta
              </Button>
            </div>
            {pending && (
              <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>
                Parar espera
              </Button>
            )}
            {error && (
              <p role="alert" className="ai-error">
                {error}
              </p>
            )}
            <small>
              Confira os dados de origem antes de tomar decisões. Nenhum documento completo é
              enviado automaticamente.
            </small>
          </form>
        </div>
      </div>
    </section>
  );
}
