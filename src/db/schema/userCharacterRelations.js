export const tableName = 'user_character_relations';

export const ddl = `
  CREATE TABLE user_character_relations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    character_id VARCHAR(64) NOT NULL,
    isfriend TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_character (user_id, character_id),
    INDEX idx_user_id (user_id),
    INDEX idx_character_id (character_id),
    INDEX idx_isfriend (isfriend)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;
