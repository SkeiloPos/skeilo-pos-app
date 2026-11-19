/** Tipo de documento legal de plataforma (spec 162, FR-001). */
export type PlatformLegalDocumentType = 'privacidad' | 'terminos';

/** Estado de la máquina borrador/publicado/superado (spec 162, FR-003/FR-004). */
export type LegalDocumentEstado = 'borrador' | 'publicado' | 'superado';

/** Mirrors `PlatformLegalDocumentOut` (contracts/super-admin-api.md). */
export interface PlatformLegalDocument {
  id: string;
  tipo: PlatformLegalDocumentType;
  version: number;
  contenido_markdown: string;
  estado: LegalDocumentEstado;
  content_hash: string;
  fecha_vigencia?: string | null;
  published_by_user_id?: string | null;
  published_at?: string | null;
}

/** Lista cerrada de variables permitidas en la plantilla legal maestra
 * (spec 162, FR-008 — mirrors `app/core/legal_template.py::ALLOWED_TEMPLATE_VARIABLES`). */
export const ALLOWED_TEMPLATE_VARIABLES = [
  'nombre_negocio',
  'identificacion_legal',
  'direccion_legal',
  'ciudad',
  'correo_contacto',
  'telefono_contacto',
] as const;

/** Mirrors `MasterLegalTemplateOut` (contracts/super-admin-api.md). */
export interface MasterLegalTemplate {
  id: string;
  version: number;
  contenido_markdown: string;
  estado: LegalDocumentEstado;
  content_hash: string;
  fecha_vigencia?: string | null;
  published_by_user_id?: string | null;
  published_at?: string | null;
}
