import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Validation schema
const searchSchema = z.object({
  query: z.string().min(1, 'La consulta de búsqueda es requerida'),
  filters: z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    provider: z.string().optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    currency: z.string().optional(),
  }).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

// Search documents endpoint
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { query: searchQuery, filters = {}, limit, offset } = searchSchema.parse(req.body);
    const userId = req.user!.id;

    // Build search conditions
    let whereConditions = ['d.user_id = ?'];
    let params: any[] = [userId];

    // Text search across multiple fields
    const textSearchConditions = [
      'd.filename LIKE ?',
      'd.provider LIKE ?', 
      'd.invoice_number LIKE ?',
      'ocr.text LIKE ?'
    ];
    
    const searchTerm = `%${searchQuery}%`;
    whereConditions.push(`(${textSearchConditions.join(' OR ')})`);
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);

    // Apply filters
    if (filters.dateFrom) {
      whereConditions.push('d.issue_date >= ?');
      params.push(filters.dateFrom);
    }
    
    if (filters.dateTo) {
      whereConditions.push('d.issue_date <= ?');
      params.push(filters.dateTo);
    }
    
    if (filters.provider) {
      whereConditions.push('d.provider LIKE ?');
      params.push(`%${filters.provider}%`);
    }
    
    if (filters.minAmount !== undefined) {
      whereConditions.push('d.amount >= ?');
      params.push(filters.minAmount);
    }
    
    if (filters.maxAmount !== undefined) {
      whereConditions.push('d.amount <= ?');
      params.push(filters.maxAmount);
    }
    
    if (filters.currency) {
      whereConditions.push('d.currency = ?');
      params.push(filters.currency);
    }

    const whereClause = whereConditions.join(' AND ');

    // Search documents
    const documents = await query(
      `SELECT 
        d.id, d.filename, d.mime_type, d.byte_size, d.status,
        d.provider, d.invoice_number, d.currency, d.amount, d.issue_date,
        d.created_at, d.updated_at,
        ocr.text as ocr_text, ocr.json as extracted_data,
        MATCH(d.filename, d.provider, d.invoice_number) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance_score
      FROM documents d
      LEFT JOIN ocr_results ocr ON d.id = ocr.document_id
      WHERE ${whereClause}
      ORDER BY relevance_score DESC, d.created_at DESC
      LIMIT ? OFFSET ?`,
      [searchQuery, ...params, limit, offset]
    );

    // Get total count for pagination
    const totalResult = await query(
      `SELECT COUNT(*) as total 
      FROM documents d
      LEFT JOIN ocr_results ocr ON d.id = ocr.document_id
      WHERE ${whereClause}`,
      params
    );

    const total = (totalResult[0] as any).total;

    // Process results for better relevance scoring
    const processedDocuments = documents.map((doc: any) => {
      let relevanceScore = doc.relevance_score || 0;
      
      // Boost score for exact matches
      if (doc.filename?.toLowerCase().includes(searchQuery.toLowerCase())) {
        relevanceScore += 10;
      }
      if (doc.provider?.toLowerCase().includes(searchQuery.toLowerCase())) {
        relevanceScore += 8;
      }
      if (doc.invoice_number?.includes(searchQuery)) {
        relevanceScore += 12;
      }
      if (doc.ocr_text?.toLowerCase().includes(searchQuery.toLowerCase())) {
        relevanceScore += 5;
      }
      
      return {
        ...doc,
        relevance_score: Math.max(relevanceScore, 0)
      };
    });

    // Sort by processed relevance score
    processedDocuments.sort((a, b) => b.relevance_score - a.relevance_score);

    res.json({
      documents: processedDocuments,
      pagination: {
        limit,
        offset,
        total,
        pages: Math.ceil(total / limit)
      },
      searchQuery,
      filters
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Datos inválidos', 
        details: error.errors 
      });
    }
    
    console.error('Search error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Smart search with natural language processing
router.post('/smart', authenticateToken, async (req, res) => {
  try {
    const { query: searchQuery, limit = 20, offset = 0 } = req.body;
    const userId = req.user!.id;

    if (!searchQuery || typeof searchQuery !== 'string') {
      return res.status(400).json({ error: 'Consulta de búsqueda requerida' });
    }

    // Parse natural language queries
    const queryAnalysis = analyzeSearchQuery(searchQuery);
    
    let whereConditions = ['d.user_id = ?'];
    let params: any[] = [userId];

    // Build conditions based on query analysis
    if (queryAnalysis.amount) {
      whereConditions.push('d.amount = ?');
      params.push(queryAnalysis.amount);
    }
    
    if (queryAnalysis.date) {
      whereConditions.push('d.issue_date = ?');
      params.push(queryAnalysis.date);
    }
    
    if (queryAnalysis.provider) {
      whereConditions.push('d.provider LIKE ?');
      params.push(`%${queryAnalysis.provider}%`);
    }
    
    if (queryAnalysis.text) {
      const textConditions = [
        'd.filename LIKE ?',
        'd.provider LIKE ?',
        'd.invoice_number LIKE ?',
        'ocr.text LIKE ?'
      ];
      whereConditions.push(`(${textConditions.join(' OR ')})`);
      const textTerm = `%${queryAnalysis.text}%`;
      params.push(textTerm, textTerm, textTerm, textTerm);
    }

    const whereClause = whereConditions.join(' AND ');

    const documents = await query(
      `SELECT 
        d.id, d.filename, d.mime_type, d.byte_size, d.status,
        d.provider, d.invoice_number, d.currency, d.amount, d.issue_date,
        d.created_at, d.updated_at,
        ocr.text as ocr_text, ocr.json as extracted_data
      FROM documents d
      LEFT JOIN ocr_results ocr ON d.id = ocr.document_id
      WHERE ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      documents,
      queryAnalysis,
      searchQuery
    });

  } catch (error) {
    console.error('Smart search error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Helper function to analyze natural language queries
function analyzeSearchQuery(query: string) {
  const analysis: any = {
    text: query,
    amount: null,
    date: null,
    provider: null
  };

  // Extract amounts (e.g., "45,67€", "52.30", "100 euros")
  const amountRegex = /(\d+[.,]\d{2})\s*€?|(\d+)\s*(?:euros?|€)/gi;
  const amountMatch = query.match(amountRegex);
  if (amountMatch) {
    const amountStr = amountMatch[0].replace(/[^\d.,]/g, '').replace(',', '.');
    analysis.amount = parseFloat(amountStr);
  }

  // Extract dates (e.g., "15 marzo 2024", "15/03/2024", "marzo 2024")
  const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{1,2}\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4})/gi;
  const dateMatch = query.match(dateRegex);
  if (dateMatch) {
    analysis.date = dateMatch[0];
  }

  // Extract provider names (e.g., "Repsol", "Cepsa", "Gas Natural")
  const providerRegex = /(?:de|from|para|to|en)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
  const providerMatch = query.match(providerRegex);
  if (providerMatch) {
    analysis.provider = providerMatch[0].replace(/^(de|from|para|to|en)\s+/i, '');
  }

  return analysis;
}

// Get search suggestions
router.get('/suggestions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const queryParam = req.query.q;
    const q: string = typeof queryParam === 'string' ? queryParam : Array.isArray(queryParam) ? (queryParam[0] as string) || '' : '';

    if (q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const searchTerm = `%${q}%`;

    // Get suggestions from different fields
    const [providers, invoiceNumbers, amounts] = await Promise.all([
      query(
        'SELECT DISTINCT provider FROM documents WHERE user_id = ? AND provider LIKE ? LIMIT 5',
        [userId, searchTerm]
      ),
      query(
        'SELECT DISTINCT invoice_number FROM documents WHERE user_id = ? AND invoice_number LIKE ? LIMIT 5',
        [userId, searchTerm]
      ),
      query(
        'SELECT DISTINCT amount FROM documents WHERE user_id = ? AND amount LIKE ? LIMIT 5',
        [userId, searchTerm]
      )
    ]);

    const suggestions = [
      ...providers.map((p: any) => ({ type: 'provider', value: p.provider })),
      ...invoiceNumbers.map((i: any) => ({ type: 'invoice', value: i.invoice_number })),
      ...amounts.map((a: any) => ({ type: 'amount', value: `${a.amount}€` }))
    ];

    res.json({ suggestions });

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
