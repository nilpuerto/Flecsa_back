INSERT IGNORE INTO users (id, email, password_hash, name) VALUES
  (1, 'support@flecsa.com', '$argon2id$v=19$m=65536,t=3,p=1$BWFzZVNvbHRSYW5kb21TYWx0$FJ3qV3H4J9Hk2qV8cQ4y0mKQ6Ybq3l2qYcQhT+qA2fE', 'Usuario Demo');
-- Nota: reemplazar hash en entorno real. Este es un placeholder no funcional.

INSERT IGNORE INTO tags (name) VALUES ('Factura'), ('Gasolina'), ('Ticket'), ('Nota'); 