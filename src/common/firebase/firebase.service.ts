import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'node:fs';
import * as path from 'node:path';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firestoreInstance: admin.firestore.Firestore;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const serviceAccountPath = this.config.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_PATH',
    );

    if (!serviceAccountPath) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_PATH não configurado — Firebase desabilitado',
      );
      return;
    }

    try {
      // Evita inicializar duas vezes (ex.: hot-reload)
      if (admin.apps.length === 0) {
        const resolvedPath = path.isAbsolute(serviceAccountPath)
          ? serviceAccountPath
          : path.resolve(process.cwd(), serviceAccountPath);

        const serviceAccount = JSON.parse(
          fs.readFileSync(resolvedPath, 'utf-8'),
        ) as admin.ServiceAccount;

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      this.firestoreInstance = admin.firestore();
      this.logger.log('Firebase Admin SDK inicializado com sucesso');
    } catch (error) {
      this.logger.error(
        `Erro ao inicializar Firebase: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Retorna a instância do Firestore (pode ser null se Firebase não estiver configurado) */
  get firestore(): admin.firestore.Firestore | null {
    return this.firestoreInstance ?? null;
  }

  /** Verifica se o Firebase está disponível */
  get isAvailable(): boolean {
    return !!this.firestoreInstance;
  }

  // ─── HELPERS DE ESCRITA NO FIRESTORE ──────────────────

  /**
   * Atualizar ou criar documento no Firestore
   */
  async setDocument(
    collectionPath: string,
    docId: string,
    data: Record<string, unknown>,
    merge = true,
  ): Promise<void> {
    if (!this.firestoreInstance) {
      this.logger.warn('Firebase indisponível — ignorando escrita no Firestore');
      return;
    }

    try {
      await this.firestoreInstance
        .collection(collectionPath)
        .doc(docId)
        .set(
          { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge },
        );
    } catch (error) {
      this.logger.error(
        `Erro ao escrever no Firestore [${collectionPath}/${docId}]: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Deletar documento do Firestore
   */
  async deleteDocument(
    collectionPath: string,
    docId: string,
  ): Promise<void> {
    if (!this.firestoreInstance) return;

    try {
      await this.firestoreInstance
        .collection(collectionPath)
        .doc(docId)
        .delete();
    } catch (error) {
      this.logger.error(
        `Erro ao deletar no Firestore [${collectionPath}/${docId}]: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
