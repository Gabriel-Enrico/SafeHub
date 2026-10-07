import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import {
  deactivateUsuario,
  getMyPerfil,
  getUsuarioById,
  inviteUsuario,
  listUsuarios,
  updateUsuario,
} from '../controllers/usuariosController.js';
import type { UsuarioInviteBody, UsuarioListQuery, UsuarioParams, UsuarioPatch } from '../type/usuarios.js';

const idParams = {
  type: 'object', required: ['id'],
  properties: { id: { type: 'string', pattern: '^[1-9]\\d*$' } },
  additionalProperties: false,
};
const role = { type: 'string', enum: ['Administrador', 'Operador'] };

export async function usuariosRoutes(fastify: FastifyInstance) {
  fastify.get('/usuarios/me', getMyPerfil);

  await fastify.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin);

    admin.get<{ Querystring: UsuarioListQuery }>('/usuarios', {
      schema: { querystring: {
        type: 'object', properties: {
          limit: { type: 'string' }, offset: { type: 'string' }, busca: { type: 'string', maxLength: 200 },
        }, additionalProperties: false,
      } },
    }, listUsuarios);

    admin.post<{ Body: UsuarioInviteBody }>('/usuarios', {
      schema: { body: {
        type: 'object', required: ['nome', 'email', 'cargo'],
        properties: {
          nome: { type: 'string', minLength: 1, maxLength: 200 },
          email: { type: 'string', minLength: 3, maxLength: 320, format: 'email' },
          cargo: role,
          equipe_id: { type: ['integer', 'null'], minimum: 1 },
        }, additionalProperties: false,
      } },
    }, inviteUsuario);

    admin.get<{ Params: UsuarioParams }>('/usuarios/:id', { schema: { params: idParams } }, getUsuarioById);
    admin.patch<{ Params: UsuarioParams; Body: UsuarioPatch }>('/usuarios/:id', {
      schema: {
        params: idParams,
        body: { type: 'object', minProperties: 1, properties: {
          nome: { type: 'string', minLength: 1, maxLength: 200 },
          cargo: role,
          equipe_id: { type: ['integer', 'null'], minimum: 1 },
          avatar: { type: ['string', 'null'], maxLength: 1000 },
          ativo: { type: 'boolean' },
        }, additionalProperties: false },
      },
    }, updateUsuario);
    admin.delete<{ Params: UsuarioParams }>('/usuarios/:id', { schema: { params: idParams } }, deactivateUsuario);
  });
}
