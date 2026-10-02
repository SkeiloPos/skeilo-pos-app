import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { InvitationsService } from '../services/invitations.service';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  CASHIER: 'Cajero',
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  ADMIN: 'bg-indigo-100 text-indigo-700',
  CASHIER: 'bg-green-100 text-green-700',
};

@Component({
  selector: 'app-pending-invitations-list',
  standalone: true,
  template: `
    @if (invitationsService.pendingInvitations().length > 0) {
      <div class="bg-amber-50/60 rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-amber-200">
          <p class="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            Invitaciones pendientes ({{ invitationsService.pendingTotal() }})
          </p>
        </div>
        <div class="divide-y divide-amber-100">
          @for (invitation of invitationsService.pendingInvitations(); track invitation.id) {
            <div class="px-5 py-4 flex items-center justify-between gap-3">
              <div class="min-w-0">
                @if (invitation.name) {
                  <p data-testid="invitation-title" class="text-sm font-semibold text-gray-800 truncate">
                    {{ invitation.name }}
                  </p>
                  <p data-testid="invitation-email" class="text-xs text-gray-500 truncate">
                    {{ invitation.email }}
                  </p>
                } @else {
                  <p data-testid="invitation-title" class="text-sm font-semibold text-gray-800 truncate">
                    {{ invitation.email }}
                  </p>
                }
                <p class="text-xs text-gray-500">
                  Enviada el {{ invitation.sent_at | date: 'dd/MM/yyyy HH:mm' }}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span
                  class="text-xs px-2.5 py-1 rounded-full font-semibold"
                  [class]="roleBadgeClass(invitation.role_name)"
                >
                  {{ roleLabel(invitation.role_name) }}
                </span>
                <span class="text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
                  Pendiente
                </span>
                <button
                  (click)="onResend(invitation.id)"
                  [disabled]="invitationsService.isSubmitting()"
                  class="text-xs px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 font-semibold hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                >
                  Reenviar
                </button>
                <button
                  (click)="onCancel(invitation.id)"
                  [disabled]="invitationsService.isSubmitting()"
                  class="text-xs px-3 py-1.5 rounded-xl bg-red-50 text-red-600 font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  imports: [DatePipe],
})
export class PendingInvitationsListComponent {
  readonly invitationsService = inject(InvitationsService);

  roleLabel(roleName: string | null): string {
    const key = roleName?.toUpperCase() ?? '';
    return ROLE_LABELS[key] ?? roleName ?? '—';
  }

  roleBadgeClass(roleName: string | null): string {
    const key = roleName?.toUpperCase() ?? '';
    return ROLE_BADGE_CLASSES[key] ?? 'bg-gray-100 text-gray-500';
  }

  async onResend(id: string): Promise<void> {
    await this.invitationsService.resendInvitation(id);
  }

  async onCancel(id: string): Promise<void> {
    if (!confirm('¿Cancelar esta invitación? Su contraseña temporal dejará de servir de inmediato.')) {
      return;
    }
    await this.invitationsService.cancelInvitation(id);
  }
}
