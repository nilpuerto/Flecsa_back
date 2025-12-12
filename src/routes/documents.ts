import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { query } from '../config/db.js';
import { authenticateToken, checkStorageLimit } from '../middleware/auth.js';
import { createWorker } from 'tesseract.js';

const router = Router();

// Configure multer for file uploads (per-user segmented directories)
const storage = multer.diskStorage({
  destination: async (req: any, file, cb) => {
    try {
      const userId = req?.user?.id ?? 'anonymous';
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const uploadDir = path.join(process.cwd(), 'uploads', String(userId), year, month);
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (e) {
      cb(e as Error, '');
    }
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    // Up to 1GB by default; plans/space are enforced separately via checkStorageLimit
    fileSize: parseInt(process.env.MAX_FILE_SIZE || String(1024 * 1024 * 1024)),
  },
  fileFilter: (req: any, file, cb) => {
    // Accept ALL file types - no restrictions
    cb(null, true);
  }
});

// Validation schemas
const uploadSchema = z.object({
  provider: z.string().optional(),
  invoiceNumber: z.string().optional(),
  currency: z.string().optional(),
  amount: z.string().optional(),
  issueDate: z.string().optional(),
});

// Helper function to encrypt buffer with AES-256-GCM using createCipheriv
function encryptBuffer(buffer: Buffer, userId: number) {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const baseSecret = process.env.FILE_ENC_SECRET || 'dev-secret-change';
  const key = crypto.scryptSync(`${baseSecret}:${userId}`, 'flecsa-salt', 32);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  cipher.setAAD(Buffer.from('flecsa-document', 'utf8'));
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
}

// Helper function to decrypt buffer with AES-256-GCM
function decryptBuffer(buffer: Buffer, iv: Buffer, authTag: Buffer, userId: number) {
  const algorithm = 'aes-256-gcm';
  const baseSecret = process.env.FILE_ENC_SECRET || 'dev-secret-change';
  const key = crypto.scryptSync(`${baseSecret}:${userId}`, 'flecsa-salt', 32);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAAD(Buffer.from('flecsa-document', 'utf8'));
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(buffer), decipher.final()]);
  return decrypted;
}

// Very simple auto-tagging from text and metadata
function normalizeTagName(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // remove accents
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function inferTags(params: { text: string; provider?: string | null; filename: string; isImage?: boolean }) {
  const tags = new Set<string>();
  const t = (params.text || '').toLowerCase();
  const name = (params.filename || '').toLowerCase();
  const prov = (params.provider || '').toLowerCase();

  const add = (s: string) => tags.add(s);

  // Basic heuristics
  if (/(factura|invoice)\b/.test(t) || /factura/.test(name)) add('facturas');
  if (/(ticket|recibo)\b/.test(t) || /ticket|recibo/.test(name)) add('tickets');
  if (/(nota|note)\b/.test(t) || /nota/.test(name)) add('notas');
  if (/(hacienda|hisenda|impuesto|tax)\b/.test(t)) add('impuestos');
  if (/(nómina|nomina|payroll)\b/.test(t)) add('nominas');
  if (/(banco|transferencia|iban|swift)\b/.test(t)) add('banco');
  if (prov) add(prov);
  if (params.isImage) add('foto');
  if (!params.isImage && (name.endsWith('.pdf') || t.includes('pdf'))) add('pdf');

  // Normalize and deduplicate
  const normalized = new Set<string>();
  for (const tag of tags) {
    const n = normalizeTagName(tag);
    if (n) normalized.add(n);
  }
  return Array.from(normalized).slice(0, 10);
}

// Helper function to process OCR (only for images; skip PDFs here)
async function processOCR(filePath: string) {
  try {
    const worker = await createWorker('spa+eng'); // Spanish + English
    const { data: { text } } = await worker.recognize(filePath);
    await worker.terminate();
    
    // Extract structured data from text
    const structuredData = extractDocumentData(text);
    
    return {
      text,
      json: structuredData
    };
  } catch (error) {
    console.error('OCR processing error:', error);
    return {
      text: '',
      json: null
    };
  }
}

// Helper function to extract structured data from OCR text
function extractDocumentData(text: string) {
  const data: any = {};
  
  // Extract amounts (look for currency patterns)
  const amountRegex = /(\d+[.,]\d{2})\s*€?/g;
  const amounts = text.match(amountRegex);
  if (amounts && amounts.length > 0) {
    data.amount = amounts[0].replace(',', '.');
  }
  
  // Extract dates (various formats)
  const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/g;
  const dates = text.match(dateRegex);
  if (dates && dates.length > 0) {
    data.issueDate = dates[0];
  }
  
  // Extract invoice numbers
  const invoiceRegex = /(?:factura|invoice|ticket|recibo)[\s\#\:]*(\d+)/gi;
  const invoiceMatch = text.match(invoiceRegex);
  if (invoiceMatch) {
    data.invoiceNumber = invoiceMatch[0].replace(/[^\d]/g, '');
  }
  
  // Extract provider/company names (look for common patterns)
  const providerRegex = /(?:de|from|para|to)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const providerMatch = text.match(providerRegex);
  if (providerMatch) {
    data.provider = providerMatch[0].replace(/^(de|from|para|to)[\s:]+/i, '');
  }
  
  return data;
}

// Upload document endpoint
router.post('/upload', authenticateToken, checkStorageLimit, upload.single('document'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }

    const { provider, invoiceNumber, currency, amount, issueDate } = uploadSchema.parse(req.body);
    const userId = req.user!.id;
    const fileSize = req.file.size;

    // Check storage limit again with actual file size
    const newStorageUsed = req.user!.storageUsed + fileSize;
    if (newStorageUsed > req.user!.storageLimit) {
      // Clean up uploaded file
      await fs.unlink(req.file.path);
      return res.status(413).json({ 
        error: 'Límite de almacenamiento excedido',
        currentUsage: req.user!.storageUsed,
        limit: req.user!.storageLimit,
        requestedSize: fileSize,
        availableSpace: req.user!.storageLimit - req.user!.storageUsed
      });
    }

    // OCR first (only for images). PDFs skipped here to avoid errors.
    let ocrText = '';
    let ocrJson: any = null;
    if (req.file.mimetype.startsWith('image/')) {
      try {
        const ocr = await processOCR(req.file.path);
        ocrText = ocr.text;
        ocrJson = ocr.json;
      } catch (e) {
        console.error('OCR failed, continuing without text:', e);
      }
    }

    // Read original file buffer and then encrypt
    const originalBuffer = await fs.readFile(req.file.path);
    const { encrypted, iv, authTag } = encryptBuffer(originalBuffer, userId);

    // Compute secure storage path
    const ext = path.extname(req.file.originalname) || '.bin';
    const storedName = path.basename(req.file.filename, path.extname(req.file.filename)) + '.encrypted';
    const encryptedFilePath = path.join(path.dirname(req.file.path), storedName);
    await fs.writeFile(encryptedFilePath, encrypted);

    // Delete original file on disk
    await fs.unlink(req.file.path);

    // Save document to database
    const documentResult = await query(
      `INSERT INTO documents (
        user_id, filename, mime_type, byte_size, storage_path, 
        iv, auth_tag, status, provider, invoice_number, 
        currency, amount, issue_date, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        req.file.originalname,
        req.file.mimetype,
        fileSize,
        encryptedFilePath,
        iv,
        authTag,
        'ready',
        provider || null,
        invoiceNumber || null,
        currency || 'EUR',
        amount ? parseFloat(amount) : null,
        issueDate || null,
        JSON.stringify(ocrJson || {})
      ]
    );

    const documentId = (documentResult as any).insertId;

    // Save OCR results
    // Skip saving noisy OCR text for images that have almost no text content
    const isImage = req.file.mimetype.startsWith('image/');
    const trimmedOcr = (ocrText || '').replace(/\s+/g, ' ').trim();
    const hasMeaningfulText = trimmedOcr.length >= 20; // heuristic to avoid garbage
    await query(
      'INSERT INTO ocr_results (document_id, text, json) VALUES (?, ?, ?)',
      [documentId, isImage && !hasMeaningfulText ? '' : ocrText, JSON.stringify(ocrJson)]
    );

    // Auto-tagging: create tags if needed and link (reuse similar existing tags)
    try {
      const inferred = inferTags({ 
        text: ocrText, 
        provider: provider || null, 
        filename: req.file.originalname,
        isImage: req.file.mimetype.startsWith('image/')
      });

      const existingTags = await query<{ id: number; name: string }>('SELECT id, name FROM tags');
      const singular = (s: string) => s.endsWith('s') ? s.slice(0, -1) : s;

      const pickSimilarExisting = (candidate: string) => {
        const cSing = singular(candidate);
        for (const row of existingTags) {
          const n = row.name;
          if (n === candidate) return n;
          if (singular(n) === cSing) return n;
          if (n.startsWith(cSing) || cSing.startsWith(n)) return n;
        }
        return candidate;
      };

      for (const tagName of inferred) {
        const norm = normalizeTagName(pickSimilarExisting(tagName));
        await query(
          'INSERT INTO tags (name) VALUES (?) ON DUPLICATE KEY UPDATE name = name',
          [norm]
        );
        const rows = await query<{ id: number }>('SELECT id FROM tags WHERE name = ?', [norm]);
        const tagId = rows[0]?.id;
        if (tagId) {
          await query(
            'INSERT IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)',
            [documentId, tagId]
          );
        }
      }
    } catch (e) {
      console.error('Auto-tagging error:', e);
    }

    // Update user storage usage
    await query(
      'UPDATE users SET storage_used = storage_used + ? WHERE id = ?',
      [fileSize, userId]
    );

    res.status(201).json({
      message: 'Documento subido y procesado exitosamente',
      document: {
        id: documentId,
        filename: req.file.originalname,
        size: fileSize,
        status: 'ready',
        provider: provider || null,
        invoiceNumber: invoiceNumber || null,
        amount: amount ? parseFloat(amount) : null,
        issueDate: issueDate || null,
        ocrText: ocrText,
        extractedData: ocrJson
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded file if it exists
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Datos inválidos', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get user documents
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { page = 1, limit = 20, search = '' } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = 'WHERE d.user_id = ?';
    let params: any[] = [userId];
    
    if (search) {
      whereClause += ' AND (d.filename LIKE ? OR d.provider LIKE ? OR d.invoice_number LIKE ? OR ocr.text LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    const documents = await query(
      `SELECT 
        d.id, d.filename, d.mime_type, d.byte_size, d.status, 
        d.provider, d.invoice_number, d.currency, d.amount, d.issue_date, 
        d.created_at, d.updated_at,
        ocr.text as ocr_text, ocr.json as extracted_data,
        GROUP_CONCAT(DISTINCT t.name) AS tags
      FROM documents d
      LEFT JOIN ocr_results ocr ON d.id = ocr.document_id
      LEFT JOIN document_tags dt ON dt.document_id = d.id
      LEFT JOIN tags t ON t.id = dt.tag_id
      ${whereClause}
      GROUP BY d.id
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM documents d
      LEFT JOIN ocr_results ocr ON d.id = ocr.document_id
      ${whereClause}`,
      params
    );
    
    const total = (totalResult[0] as any).total;
    
    res.json({
      documents,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
    
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get user's tags with counts
router.get('/tags', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const rows = await query(
      `SELECT t.name AS tag, COUNT(*) AS count
       FROM document_tags dt
       INNER JOIN tags t ON t.id = dt.tag_id
       INNER JOIN documents d ON d.id = dt.document_id
       WHERE d.user_id = ?
       GROUP BY t.name
       ORDER BY count DESC, t.name ASC`,
      [userId]
    );
    res.json({ tags: rows });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get single document
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const documents = await query(
      `SELECT 
        d.*, ocr.text as ocr_text, ocr.json as extracted_data
      FROM documents d
      LEFT JOIN ocr_results ocr ON d.id = ocr.document_id
      WHERE d.id = ? AND d.user_id = ?`,
      [id, userId]
    );
    
    if (documents.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    res.json({ document: documents[0] });
    
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Stream preview (inline) - decrypt on the fly
router.get('/:id/preview', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    console.log('Preview request:', { id, userId });

    const rows = await query(
      'SELECT filename, mime_type, storage_path, iv, auth_tag FROM documents WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (rows.length === 0) {
      console.error('Document not found:', { id, userId });
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    const doc: any = rows[0];

    console.log('Document found:', { filename: doc.filename, mime_type: doc.mime_type, storage_path: doc.storage_path });

    // Check if file exists
    try {
      await fs.access(doc.storage_path);
    } catch (accessError) {
      console.error('File not accessible:', doc.storage_path, accessError);
      return res.status(404).json({ error: 'Archivo no encontrado en el servidor' });
    }

    const encrypted = await fs.readFile(doc.storage_path);
    const iv = Buffer.isBuffer(doc.iv) ? doc.iv : Buffer.from(doc.iv?.data || doc.iv);
    const authTag = Buffer.isBuffer(doc.auth_tag) ? doc.auth_tag : Buffer.from(doc.auth_tag?.data || doc.auth_tag);
    const decrypted = decryptBuffer(encrypted, iv, authTag, userId);

    console.log('Sending preview:', { size: decrypted.length, mime_type: doc.mime_type });

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
    res.send(decrypted);
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Download (attachment) - decrypt on the fly
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const rows = await query(
      'SELECT filename, mime_type, storage_path, iv, auth_tag FROM documents WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado' });
    const doc: any = rows[0];

    const encrypted = await fs.readFile(doc.storage_path);
    const iv = Buffer.isBuffer(doc.iv) ? doc.iv : Buffer.from(doc.iv?.data || doc.iv);
    const authTag = Buffer.isBuffer(doc.auth_tag) ? doc.auth_tag : Buffer.from(doc.auth_tag?.data || doc.auth_tag);
    const decrypted = decryptBuffer(encrypted, iv, authTag, userId);

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);
    res.send(decrypted);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Update metadata (name, issue_date)
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { filename, issueDate } = req.body as { filename?: string; issueDate?: string };

    console.log('Update document request:', { id, userId, filename, issueDate });

    const rows = await query('SELECT id FROM documents WHERE id = ? AND user_id = ?', [id, userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado' });

    if (filename) {
      await query('UPDATE documents SET filename = ? WHERE id = ?', [filename, id]);
      console.log('Filename updated:', filename);
    }
    if (issueDate) {
      await query('UPDATE documents SET issue_date = ? WHERE id = ?', [issueDate, id]);
      console.log('Issue date updated:', issueDate);
    }
    
    // Return updated document
    const updatedDocs = await query(
      `SELECT 
        d.*, ocr.text as ocr_text, ocr.json as extracted_data
      FROM documents d
      LEFT JOIN ocr_results ocr ON d.id = ocr.document_id
      WHERE d.id = ? AND d.user_id = ?`,
      [id, userId]
    );
    
    res.json({ message: 'Documento actualizado', document: updatedDocs[0] });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Delete document
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    // Get document info
    const documents = await query(
      'SELECT id, byte_size, storage_path FROM documents WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    
    if (documents.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    const document = documents[0] as any;
    
    // Delete file from storage
    try {
      await fs.unlink(document.storage_path);
    } catch (fileError) {
      console.error('File deletion error:', fileError);
    }
    
    // Delete from database (cascade will handle related records)
    await query('DELETE FROM documents WHERE id = ?', [id]);
    
    // Update user storage usage
    await query(
      'UPDATE users SET storage_used = storage_used - ? WHERE id = ?',
      [document.byte_size, userId]
    );
    
    res.json({ message: 'Documento eliminado exitosamente' });
    
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
