import {
  InteractionRequiredAuthError,
  type AccountInfo,
} from '@azure/msal-node';
import { getMicrosoftOAuthConfig } from '../config/microsoft.js';
import { ApiError } from '../utils/apiError.js';
import { createOutlookCachePlugin } from './outlookCachePlugin.js';
import { setOutlookConnectionStatus } from './usuarioIntegracoes.js';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPES = ['Calendars.ReadWrite'];

async function getOutlookAccessToken(userId: string): Promise<string> {
  const { client } = getMicrosoftOAuthConfig(
    createOutlookCachePlugin(userId)
  );

  let accounts: AccountInfo[];
  try {
    accounts = await client.getTokenCache().getAllAccounts();
  } catch {
    throw new ApiError(
      502,
      'OUTLOOK_CACHE_UNAVAILABLE',
      'Não foi possível carregar a conexão Outlook.'
    );
  }

  if (accounts.length === 0) {
    throw new ApiError(
      409,
      'OUTLOOK_NOT_CONNECTED',
      'Conecte sua conta Outlook antes de usar a agenda.'
    );
  }

  if (accounts.length > 1) {
    throw new ApiError(
      409,
      'OUTLOOK_MULTIPLE_ACCOUNTS',
      'Há mais de uma conta Microsoft nesta conexão. Desconecte e conecte novamente.'
    );
  }

  try {
    const result = await client.acquireTokenSilent({
      account: accounts[0],
      scopes: GRAPH_SCOPES,
    });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await setOutlookConnectionStatus(userId, 'reautorizacao_necessaria');
      throw new ApiError(
        401,
        'OUTLOOK_REAUTH_REQUIRED',
        'Reconecte sua conta Outlook para continuar.'
      );
    }
    throw new ApiError(
      502,
      'OUTLOOK_TOKEN_UNAVAILABLE',
      'Não foi possível obter uma autorização válida para a agenda Outlook.'
    );
  }
}

async function graphRequest<T>(
  userId: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<T> {
  const accessToken = await getOutlookAccessToken(userId);
  let response: Response;

  try {
    response = await fetch(`${GRAPH_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(
      502,
      'OUTLOOK_GRAPH_UNAVAILABLE',
      'Não foi possível conectar ao Microsoft Graph.'
    );
  }

  if (response.status === 401) {
    await setOutlookConnectionStatus(userId, 'reautorizacao_necessaria');
    throw new ApiError(
      401,
      'OUTLOOK_REAUTH_REQUIRED',
      'Reconecte sua conta Outlook para continuar.'
    );
  }

  if (response.status === 403) {
    throw new ApiError(
      403,
      'OUTLOOK_PERMISSION_DENIED',
      'A Microsoft não autorizou esta operação na agenda.'
    );
  }

  if (response.status === 404) {
    throw new ApiError(404, 'NOT_FOUND', 'Evento Outlook não encontrado.');
  }

  if (response.status === 400) {
    throw new ApiError(
      400,
      'OUTLOOK_INVALID_EVENT',
      'Confira os dados e o intervalo de horário do evento.'
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status === 429 ? 503 : 502,
      response.status === 429 ? 'OUTLOOK_RATE_LIMITED' : 'OUTLOOK_GRAPH_ERROR',
      'O Microsoft Graph não conseguiu concluir a operação.'
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface OutlookCalendarQuery {
  startDateTime: string;
  endDateTime: string;
}

export async function listOutlookEvents(
  userId: string,
  range: OutlookCalendarQuery
) {
  const url = new URL(`${GRAPH_BASE_URL}/me/calendarView`);
  url.searchParams.set('startDateTime', range.startDateTime);
  url.searchParams.set('endDateTime', range.endDateTime);
  url.searchParams.set(
    '$select',
    'id,subject,bodyPreview,start,end,location,isAllDay,webLink,attendees'
  );
  url.searchParams.set('$orderby', 'start/dateTime');
  url.searchParams.set('$top', '100');

  const events: unknown[] = [];
  let pageUrl: string | undefined = url.toString();
  while (pageUrl) {
    const currentUrl = new URL(pageUrl);
    if (
      currentUrl.origin !== GRAPH_BASE_URL.split('/v1.0')[0] ||
      !currentUrl.pathname.startsWith('/v1.0/')
    ) {
      throw new ApiError(
        502,
        'OUTLOOK_GRAPH_INVALID_PAGE',
        'O Microsoft Graph retornou uma página inválida.'
      );
    }

    const page = await graphRequest<{
      value?: unknown[];
      '@odata.nextLink'?: string;
    }>(
      userId,
      `${currentUrl.pathname.slice('/v1.0'.length)}${currentUrl.search}`,
      'GET'
    );
    events.push(...(page.value ?? []));
    pageUrl = page['@odata.nextLink'];
  }

  return { value: events };
}

export async function createOutlookEvent(userId: string, body: unknown) {
  return graphRequest(userId, '/me/events', 'POST', body);
}

export async function updateOutlookEvent(
  userId: string,
  eventId: string,
  body: unknown
) {
  return graphRequest(
    userId,
    `/me/events/${encodeURIComponent(eventId)}`,
    'PATCH',
    body
  );
}

export async function deleteOutlookEvent(userId: string, eventId: string) {
  return graphRequest(
    userId,
    `/me/events/${encodeURIComponent(eventId)}`,
    'DELETE'
  );
}
