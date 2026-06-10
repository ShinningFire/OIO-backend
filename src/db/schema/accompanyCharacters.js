export const tableName = 'accompany_characters';

export const ddl = `
  CREATE TABLE accompany_characters (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    tag VARCHAR(64) DEFAULT '陪伴中',
    description VARCHAR(512),
    avatar_url VARCHAR(512),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_updated_at (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;
