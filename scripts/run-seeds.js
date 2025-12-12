import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const seedsDir = path.resolve(process.cwd(), 'sql', 'seeds');

async function main() {
	const files = fs.readdirSync(seedsDir).filter(f => f.endsWith('.sql')).sort();
	const conn = await mysql.createConnection({
		host: process.env.DB_HOST,
		port: Number(process.env.DB_PORT || 3306),
		user: process.env.DB_USER,
		password: process.env.DB_PASSWORD,
		database: process.env.DB_NAME,
		multipleStatements: true,
	});

	for (const file of files) {
		const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
		console.log('Seeding', file);
		await conn.query(sql);
	}

	await conn.end();
	console.log('Seeds completed');
}

main().catch(err => {
	console.error(err);
	process.exit(1);
}); 