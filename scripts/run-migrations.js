import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const migrationsDir = path.resolve(process.cwd(), 'sql', 'migrations');

async function main() {
	const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
	const conn = await mysql.createConnection({
		host: process.env.DB_HOST,
		port: Number(process.env.DB_PORT || 3306),
		user: process.env.DB_USER,
		password: process.env.DB_PASSWORD,
		multipleStatements: true,
	});

	await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
	await conn.query(`USE \`${process.env.DB_NAME}\``);
	await conn.query(`CREATE TABLE IF NOT EXISTS _migrations (id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

	for (const file of files) {
		const [rows] = await conn.query('SELECT 1 FROM _migrations WHERE filename = ?', [file]);
		if (Array.isArray(rows) && rows.length > 0) continue;
		const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
		console.log('Applying', file);
		await conn.query(sql);
		await conn.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
	}

	await conn.end();
	console.log('Migrations completed');
}

main().catch(err => {
	console.error(err);
	process.exit(1);
}); 