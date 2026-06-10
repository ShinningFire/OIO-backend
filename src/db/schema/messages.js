export const tableName = 'messages';

export const ddl = `
  CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    role VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(16) DEFAULT 'normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_user_id (user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;
