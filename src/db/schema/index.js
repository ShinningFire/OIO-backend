import * as users from './users.js';
import * as conversations from './conversations.js';
import * as messages from './messages.js';
import * as eventLogs from './eventLogs.js';
import * as userCharacterProfiles from './userCharacterProfiles.js';
import * as userCharacterRelations from './userCharacterRelations.js';
import * as accompanyCharacters from './accompanyCharacters.js';
import * as accompanyActivities from './accompanyActivities.js';
import * as userOnboardingProfiles from './userOnboardingProfiles.js';

export const TABLE_SCHEMAS = [
  users,
  conversations,
  messages,
  eventLogs,
  userCharacterProfiles,
  userCharacterRelations,
  accompanyCharacters,
  accompanyActivities,
  userOnboardingProfiles,
];
