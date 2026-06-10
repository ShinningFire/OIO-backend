export const tableName = 'user_onboarding_profiles';

export const ddl = `
  CREATE TABLE user_onboarding_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    nickname VARCHAR(64) NOT NULL,
    birthday DATE NOT NULL,
    gender VARCHAR(16) NOT NULL,
    avatar_url VARCHAR(512) NOT NULL,
    personality TEXT NOT NULL,
    daily TEXT NOT NULL,
    hobbies TEXT NOT NULL,
    self_portrait TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_id (user_id),
    INDEX idx_nickname (nickname)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;
