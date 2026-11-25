import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.').max(320),
  password: z.string().min(1, 'Informe sua senha.'),
});

export const recoveryEmailSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.').max(320),
});

export const newPasswordSchema = z.object({
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
  confirmation: z.string().min(1, 'Repita a nova senha.'),
}).refine((value) => value.password === value.confirmation, {
  path: ['confirmation'],
  message: 'As senhas não coincidem.',
});
