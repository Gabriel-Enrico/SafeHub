import { InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-node';
import { getMicrosoftOAuthConfig } from '../config/microsoft.js';
import { ApiError } from '../utils/apiError.js';
import { createOneDriveCachePlugin } from './outlookCachePlugin.js';
import { setOneDriveConnectionStatus } from './usuarioIntegracoes.js';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

async function getOneDriveAccessToken(userId: string): Promise<string> {
  const { client } = getMicrosoftOAuthConfig(createOneDriveCachePlugin(userId));
  let accounts: AccountInfo[];
  try {
    accounts = await client.getTokenCache().getAllAccounts();
  } catch {
    throw new ApiError(502, 'ONEDRIVE_CACHE_UNAVAILABLE', 'Não foi possível carregar a conexão OneDrive.');
  }
  if (accounts.length !== 1) {
    throw new ApiError(409, 'ONEDRIVE_NOT_CONNECTED', 'Conecte uma única conta OneDrive antes de listar os arquivos.');
  }
  try {
    const result = await client.acquireTokenSilent({ account: accounts[0], scopes: ['Files.Read'] });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await setOneDriveConnectionStatus(userId, 'reautorizacao_necessaria');
      throw new ApiError(401, 'ONEDRIVE_REAUTH_REQUIRED', 'Reconecte sua conta OneDrive para continuar.');
    }
    throw new ApiError(502, 'ONEDRIVE_TOKEN_UNAVAILABLE', 'Não foi possível obter autorização válida para o OneDrive.');
  }
}

type GraphDriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
};

export async function listOneDriveItems(userId: string, folderId?: string) {
  const token = await getOneDriveAccessToken(userId);
  const itemPath = folderId
    ? `/me/drive/items/${encodeURIComponent(folderId)}/children`
    : '/me/drive/root/children';
  const url = new URL(`${GRAPH_BASE_URL}${itemPath}`);
  url.searchParams.set('$select', 'id,name,webUrl,size,lastModifiedDateTime,file,folder');
  url.searchParams.set('$orderby', 'name');
  url.searchParams.set('$top', '100');
  let pageUrl: string | undefined = url.toString();
  const items: GraphDriveItem[] = [];

  while (pageUrl) {
    const current = new URL(pageUrl);
    if (current.origin !== 'https://graph.microsoft.com' || !current.pathname.startsWith('/v1.0/')) {
      throw new ApiError(502, 'ONEDRIVE_INVALID_PAGE', 'O Microsoft Graph retornou uma página inválida.');
    }
    let response: Response;
    try {
      response = await fetch(current, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new ApiError(502, 'ONEDRIVE_GRAPH_UNAVAILABLE', 'Não foi possível conectar ao Microsoft Graph.');
    }
    if (response.status === 401) {
      await setOneDriveConnectionStatus(userId, 'reautorizacao_necessaria');
      throw new ApiError(401, 'ONEDRIVE_REAUTH_REQUIRED', 'Reconecte sua conta OneDrive para continuar.');
    }
    if (response.status === 403) throw new ApiError(403, 'ONEDRIVE_PERMISSION_DENIED', 'A Microsoft não autorizou a leitura desses arquivos.');
    if (response.status === 404) throw new ApiError(404, 'ONEDRIVE_FOLDER_NOT_FOUND', 'Esta pasta não foi encontrada ou não está acessível.');
    if (!response.ok) throw new ApiError(response.status === 429 ? 503 : 502, response.status === 429 ? 'ONEDRIVE_RATE_LIMITED' : 'ONEDRIVE_GRAPH_ERROR', 'O Microsoft Graph não conseguiu listar os arquivos.');
    const page = await response.json() as { value?: GraphDriveItem[]; '@odata.nextLink'?: string };
    items.push(...(page.value ?? []));
    pageUrl = page['@odata.nextLink'];
  }

  return { value: items };
}
