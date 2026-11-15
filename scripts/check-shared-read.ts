import { getAdminFirestore } from '../services/usageService';
import { sharedStudyPersonal } from '../services/sharedStudyPersonal';

async function main() {
  const db = getAdminFirestore();
  const users = await db.collection('users').limit(1).get();
  if (users.empty) throw Error('No user documents found');
  const uid = users.docs[0].id;
  const service = sharedStudyPersonal();
  for (const collection of ['exams', 'studySessions', 'dailyStats', 'studyJournal']) {
    const result = await service.read(uid, collection);
    console.log(`${collection}: read OK, ${result.items.length} records`);
  }
}

main().catch(error => { console.error(`Read-only shared study probe failed: ${error.code || error.message}`); process.exitCode = 1; });
