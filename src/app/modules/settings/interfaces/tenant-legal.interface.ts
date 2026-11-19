/** Mirrors `TenantLegalProfileOut`/`TenantLegalProfileIn`
 * (spec 162, contracts/tenant-panel-api.md). */
export interface TenantLegalProfile {
  razon_social: string | null;
  identificacion_legal: string | null;
  direccion_legal: string | null;
  ciudad: string | null;
  correo_contacto: string | null;
  telefono_contacto: string | null;
}

/** Mirrors `TenantLegalDocumentOut`. */
export interface TenantLegalDocument {
  id: string;
  version: number;
  master_template_version: number;
  contenido_renderizado: string;
  content_hash: string;
  estado: 'publicado' | 'superado';
  published_at: string;
}

/** Mirrors the 422 body of `preview`/`publish` (`campos_faltantes`). */
export interface CamposFaltantesError {
  detail: string;
  campos_faltantes: string[];
}

/** Mirrors the `GET /tenant-document/template-update-status` response. */
export interface TemplateUpdateStatus {
  actualizacion_pendiente: boolean;
  version_actual: number | null;
  version_disponible: number | null;
}
