export const tableName = 'user_character_profiles';

export const ddl = `
  CREATE TABLE user_character_profiles (
    character_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64),
    zodiac VARCHAR(32),
    mbti VARCHAR(16),
    introduction TEXT,
    person_info VARCHAR(512),
    background_url VARCHAR(512),
    avatar_icon VARCHAR(512),
    person_setting TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;
