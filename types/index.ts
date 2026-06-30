// ==================== USUÁRIOS E AUTENTICAÇÃO ====================
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'gerente' | 'atendente' | 'financeiro' | 'operacional';
  phone?: string;
  avatar?: string;
  status: 'ativo' | 'inativo';
  lastLoginAt?: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

// ==================== PLANOS ====================
export interface Plano {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  categoria: 'individual' | 'familiar' | 'empresarial';
  status: 'ativo' | 'inativo';
  valorMensal: number;
  valorAnual?: number;
  taxaAdesao?: number;
  numeroMaximoBeneficiarios: number;
  carenciaDias: number;
  criadoEm: string;
  clientesAtivos?: number;
}

// ==================== CLIENTES/FAMÍLIAS ====================
export interface Cliente {
  id: string;
  codigo: string;
  nome: string;
  cpf: string;
  rg?: string;
  email: string;
  telefone: string;
  dataNascimento: string;
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    estado: string;
  };
  planoId?: string;
  planoNome?: string;
  statusAssinatura?: 'ativo' | 'suspenso' | 'cancelado' | 'inadimplente';
  valorMensal?: number;
  periodicidade?: 'mensal' | 'anual';
  diaVencimento?: number;
  formaPagamento?: 'Cartão de Crédito' | 'Débito Automático' | 'Boleto' | 'PIX';
  dataContratacao?: string;
  proximoVencimento?: string;
  criadoEm: string;
  observacoes?: string;
}

export interface ClienteContact {
  id: string;
  clientId: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  isPrimary: boolean;
}

// ==================== FALECIDOS ====================
export interface Falecido {
  id: string;
  clientId: string;
  nome: string;
  cpf: string;
  dataNascimento: string;
  dataFalecimento: string;
  horaFalecimento: string;
  localFalecimento: string;
  causaMortis: string;
  medicoDeclarante: {
    nome: string;
    crm: string;
  };
  certidaoObito?: {
    numero: string;
    livro: string;
    folha: string;
    arquivo?: string;
  };
  criadoEm: string;
}

// ==================== SERVIÇOS E PRODUTOS ====================
export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
}

export interface Service {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  basePrice: number;
  costPrice: number;
  durationHours: number;
  status: 'ativo' | 'inativo';
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string;
  totalPrice: number;
  servicesIncluded: string[];
  status: 'ativo' | 'inativo';
}

// ==================== ATENDIMENTOS/CONTRATOS ====================
export interface Atendimento {
  id: string;
  codigo: string;
  clientId: string;
  clientName: string;
  deceasedId?: string;
  deceasedName?: string;
  userId: string;
  userName: string;
  serviceDate: string;
  status: 'aguardando' | 'em_andamento' | 'concluido' | 'cancelado';
  totalValue: number;
  paidValue: number;
  notes?: string;
  services: AtendimentoService[];
  products: AtendimentoProduct[];
  contract?: Contract;
  criadoEm: string;
  atualizadoEm: string;
}

export interface AtendimentoService {
  id: string;
  attendanceId: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface AtendimentoProduct {
  id: string;
  attendanceId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Contract {
  id: string;
  attendanceId: string;
  contractNumber: string;
  pdfPath?: string;
  signedAt?: string;
  signatureHash?: string;
  status: 'pendente' | 'assinado' | 'cancelado';
}

// ==================== FINANCEIRO ====================
export interface AccountReceivable {
  id: string;
  attendanceId?: string;
  clientId: string;
  clientName: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'pendente' | 'parcial' | 'pago' | 'vencido' | 'cancelado';
  paymentDate?: string;
  installments?: PaymentInstallment[];
}

export interface PaymentInstallment {
  id: string;
  receivableId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'pendente' | 'pago' | 'vencido';
  paymentDate?: string;
}

export interface Payment {
  id: string;
  receivableId: string;
  amount: number;
  paymentMethod: 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'boleto' | 'transferencia';
  paymentDate: string;
  transactionId?: string;
  receiptPath?: string;
  notes?: string;
}

export interface AccountPayable {
  id: string;
  supplierId?: string;
  supplierName?: string;
  description: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  category: string;
  paymentDate?: string;
}

export interface CashFlow {
  id: string;
  date: string;
  type: 'entrada' | 'saida';
  category: string;
  description: string;
  amount: number;
  balance: number;
  userId: string;
  userName: string;
}

export interface Commission {
  id: string;
  userId: string;
  userName: string;
  attendanceId: string;
  percentage: number;
  amount: number;
  status: 'pendente' | 'pago';
  paidAt?: string;
}

// ==================== OPERACIONAL ====================
export interface Venue {
  id: string;
  name: string;
  type: 'capela' | 'sala_velorio' | 'sala_despedida';
  capacity: number;
  hourlyRate: number;
  status: 'disponivel' | 'ocupado' | 'manutencao';
  location: string;
}

export interface VenueBooking {
  id: string;
  attendanceId: string;
  venueId: string;
  venueName: string;
  startDatetime: string;
  endDatetime: string;
  status: 'agendado' | 'em_andamento' | 'concluido' | 'cancelado';
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  type: 'carro_funerario' | 'ambulancia' | 'utilitario';
  status: 'disponivel' | 'em_uso' | 'manutencao';
  lastMaintenance?: string;
  nextMaintenance?: string;
}

export interface VehicleSchedule {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  attendanceId: string;
  driverId?: string;
  driverName?: string;
  startDatetime: string;
  endDatetime: string;
  purpose: string;
  status: 'agendado' | 'em_andamento' | 'concluido' | 'cancelado';
}

export interface OperationalTask {
  id: string;
  attendanceId: string;
  taskName: string;
  assignedTo?: string;
  assignedToName?: string;
  status: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
  completedAt?: string;
  notes?: string;
}

// ==================== CEMITÉRIOS E JAZIGOS ====================
export interface Cemetery {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  contactPhone: string;
  managerName: string;
}

export interface BurialPlot {
  id: string;
  cemeteryId: string;
  cemeteryName: string;
  section: string;
  row: string;
  number: string;
  type: 'jazigo' | 'gaveta' | 'terreno';
  status: 'disponivel' | 'reservado' | 'ocupado';
  ownerId?: string;
  ownerName?: string;
  price: number;
}

export interface BurialRecord {
  id: string;
  deceasedId: string;
  deceasedName: string;
  burialPlotId: string;
  burialDate: string;
  burialTime: string;
  exhumationDate?: string;
}

// ==================== ESTOQUE ====================
// Tipos de estoque foram centralizados em lib/EstoqueStore.tsx
// (ProdutoEstoque, FornecedorEstoque, MovimentacaoEstoque, etc.)

// ==================== DOCUMENTAÇÃO ====================
export interface DocumentTemplate {
  id: string;
  name: string;
  type: 'certidao' | 'declaracao' | 'atestado' | 'autorizacao' | 'guia_translado';
  contentHtml: string;
  variables: string[];
  active: boolean;
}

export interface GeneratedDocument {
  id: string;
  attendanceId: string;
  templateId: string;
  templateName: string;
  filePath: string;
  generatedAt: string;
  sentAt?: string;
}

// ==================== NOTIFICAÇÕES ====================
export interface Notification {
  id: string;
  attendanceId?: string;
  clientId?: string;
  type: 'sms' | 'email' | 'whatsapp';
  channel: string;
  message: string;
  sentAt?: string;
  readAt?: string;
  status: 'pendente' | 'enviada' | 'falhou';
}

export interface NotificationTemplate {
  id: string;
  name: string;
  type: 'sms' | 'email' | 'whatsapp';
  subject?: string;
  body: string;
  variables: string[];
}