export const DOCUMENTOS_ALLOWED_ROLES = [
  'supervisao',
  'gerente',
  'diretoria',
  'gestor',
  'admin',
  'admin_sistema',
  'admin_empresa',
  'super_admin',
];

export const canAccessDocumentosByRole = (role?: string | null) =>
  DOCUMENTOS_ALLOWED_ROLES.includes((role || '').toLowerCase());
