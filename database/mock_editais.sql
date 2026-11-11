-- Script de Mock / Seed para o Módulo de Editais e Biblioteca de Respostas
-- Pode ser executado diretamente no SQL Editor do Supabase após rodar a migration 018.

DO $$
DECLARE
  v_user_id integer;
  v_project_id integer;
  v_edital_id integer;
  v_edital_2_id integer;
BEGIN
  -- 1. Obter um usuário ativo existente
  SELECT id INTO v_user_id FROM public.usuarios WHERE ativo = true LIMIT 1;
  -- 2. Obter um projeto existente (se houver)
  SELECT id INTO v_project_id FROM public.projetos LIMIT 1;

  -- 3. Inserir Edital 1 (Finep Inovação e Sustentabilidade)
  INSERT INTO public.editais (
    titulo, instituicao, link_oficial, prazo, status, responsavel_id, projeto_id, requisitos, observacoes, criado_por
  ) VALUES (
    'Edital Finep Mais Inovação Brasil 2026',
    'FINEP / Ministério da Ciência e Tecnologia',
    'http://www.finep.gov.br/chamadas-publicas/chamadapublica/715',
    CURRENT_DATE + INTERVAL '45 days',
    'em_preparacao',
    v_user_id,
    v_project_id,
    'Requisitos mínimos:' || E'\n' ||
    '- Empresa brasileira com faturamento superior a R$ 1 milhão;' || E'\n' ||
    '- Contrapartida de no mínimo 10% do valor solicitado;' || E'\n' ||
    '- Comprovação de regularidade fiscal (CND Federal, FGTS e Trabalhista);' || E'\n' ||
    '- Equipe técnica qualificada com dedicação exclusiva ao projeto.',
    'Apresentar proposta técnica focada em IA para conformidade e segurança ocupacional.',
    v_user_id
  )
  RETURNING id INTO v_edital_id;

  -- Checklist para o Edital 1
  INSERT INTO public.edital_checklist (
    edital_id, titulo, descricao, responsavel_id, prazo, documento_url, concluido, criado_por
  ) VALUES
  (
    v_edital_id,
    'Certidões de Regularidade Fiscal (CND, FGTS, CNDT)',
    'Emitir certidões no site da Receita e Caixa e anexar',
    v_user_id,
    CURRENT_DATE + INTERVAL '10 days',
    'https://www.gov.br/receitafederal/pt-br',
    true,
    v_user_id
  ),
  (
    v_edital_id,
    'Elaboração do Plano de Trabalho e Cronograma Físico-Financeiro',
    'Preencher a planilha modelo da Finep com o detalhamento de custos e metas',
    v_user_id,
    CURRENT_DATE + INTERVAL '25 days',
    null,
    false,
    v_user_id
  ),
  (
    v_edital_id,
    'Currículos Lattes dos Pesquisadores e Desenvolvedores',
    'Reunir links e PDFs dos currículos atualizados da equipe',
    v_user_id,
    CURRENT_DATE + INTERVAL '30 days',
    null,
    false,
    v_user_id
  ),
  (
    v_edital_id,
    'Carta de Anuência de Empresas Parceiras',
    'Colher assinatura digital dos diretores parceiros',
    v_user_id,
    CURRENT_DATE + INTERVAL '35 days',
    null,
    false,
    v_user_id
  );

  -- 4. Inserir Edital 2 (FAPESP PIPE Fase 2)
  INSERT INTO public.editais (
    titulo, instituicao, link_oficial, prazo, status, responsavel_id, projeto_id, requisitos, observacoes, criado_por
  ) VALUES (
    'Programa PIPE - Pesquisa Inovativa em Pequenas Empresas',
    'FAPESP',
    'https://fapesp.br/pipe/',
    CURRENT_DATE + INTERVAL '20 days',
    'mapeado',
    v_user_id,
    v_project_id,
    'Foco em desenvolvimento de protótipos funcionais e validação em ambiente real.',
    'Aguardando aprovação interna do plano de pesquisa.',
    v_user_id
  )
  RETURNING id INTO v_edital_2_id;

  INSERT INTO public.edital_checklist (
    edital_id, titulo, descricao, responsavel_id, prazo, concluido, criado_por
  ) VALUES
  (
    v_edital_2_id,
    'Resumo da Proposta em Português e Inglês',
    'Máximo de 250 palavras cada',
    v_user_id,
    CURRENT_DATE + INTERVAL '5 days',
    false,
    v_user_id
  ),
  (
    v_edital_2_id,
    'Orçamento detalhado com 3 cotações de fornecedores',
    'Itens de capital e custeio',
    v_user_id,
    CURRENT_DATE + INTERVAL '12 days',
    false,
    v_user_id
  );

  -- 5. Inserir Respostas Institucionais na Biblioteca
  INSERT INTO public.biblioteca_respostas (
    titulo, categoria, texto, versao, aprovado, proprietario_id, criado_por, atualizado_por
  ) VALUES
  (
    'Apresentação e Histórico da Empresa',
    'Institucional',
    'A SafeHub é uma empresa de tecnologia focada em soluções inteligentes de gestão integrada, segurança e conformidade para o mercado corporativo. Fundada com o propósito de simplificar operações complexas, nossa plataforma une automação em nuvem, controle de acessos em tempo real e monitoramento proativo.',
    '1.2',
    true,
    v_user_id,
    v_user_id,
    v_user_id
  ),
  (
    'Capacidade Técnica e Infraestrutura em Nuvem',
    'Tecnologia',
    'Nossa arquitetura é 100% nativa em nuvem, utilizando serviços gerenciados com alta disponibilidade (99.9%), criptografia de ponta a ponta (AES-256 e TLS 1.3), backups automáticos diários e conformidade rigorosa com a LGPD (Lei Geral de Proteção de Dados).',
    '2.0',
    true,
    v_user_id,
    v_user_id,
    v_user_id
  ),
  (
    'Política de Gestão de Riscos e Segurança da Informação',
    'Segurança & Compliance',
    'Adotamos políticas de controle de acesso baseadas em função (RBAC), autenticação multifatorial obrigatória para contas administrativas e auditoria contínua de trilhas de registro e eventos de sistema.',
    '1.0',
    false,
    v_user_id,
    v_user_id,
    v_user_id
  );

  RAISE NOTICE 'Mock de editais e respostas inserido com sucesso!';
END $$;
