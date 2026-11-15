export type School = { schoolName: string; schoolCode: string; officeCode: string; officeName: string; schoolKind: string; location: string };
export class SchoolSearchError extends Error { status = 503; }
const aliases: Record<string, string> = { '외대부고': '용인한국외국어대학교부설고등학교', '용인외대부고': '용인한국외국어대학교부설고등학교', '민사고': '민족사관고등학교', '대구과고': '대구과학고등학교', '과천외고': '과천외국어고등학교' };
const regions = ['서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원특별자치도','충청북도','충청남도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도','서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
export function createSchoolSearch(fetcher: typeof fetch = fetch, key = process.env.NEIS_API_KEY || '') {
  const cache = new Map<string, { until: number; rows: School[] }>();
  const pending = new Map<string, Promise<School[]>>();
  return async (input: string): Promise<School[]> => {
    const keyword = input.trim();
    if (keyword.length < 2) return [];
    if (keyword.length > 80) throw new SchoolSearchError('학교 이름은 80자 이내로 입력해 주세요.');
    const cached = cache.get(keyword);
    if (cached && cached.until > Date.now()) return cached.rows;
    if (pending.has(keyword)) return pending.get(keyword)!;
    const search = async () => {
      // Strip only a separate region word: 경기과학고 must remain an intact school name.
      const words = keyword.split(/\s+/);
      const region = words.length > 1 && regions.includes(words[0]) ? words.shift()! : '';
      const name = aliases[words.join(' ')] || words.join(' ');
      const url = new URL('https://open.neis.go.kr/hub/schoolInfo');
      url.search = new URLSearchParams({ Type: 'json', pIndex: '1', pSize: '100', SCHUL_NM: name, ...(key ? { KEY: key } : {}) }).toString();
      let body: any;
      try {
        const res = await fetcher(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('upstream HTTP');
        body = await res.json();
      } catch { throw new SchoolSearchError('학교 검색 서버에 연결하지 못했어요. 잠시 후 다시 검색해 주세요.'); }
      const result = body.RESULT || body.schoolInfo?.find((p: any) => p.head)?.head?.find((h: any) => h.RESULT)?.RESULT;
      if (result?.CODE === 'INFO-200') return [];
      if (result?.CODE && result.CODE !== 'INFO-000') throw new SchoolSearchError('학교 검색 서비스 설정을 확인해야 해요. 잠시 후 다시 시도해 주세요.');
      const raw = body.schoolInfo?.find((p: any) => Array.isArray(p.row))?.row;
      if (!Array.isArray(raw)) throw new SchoolSearchError('학교 검색 응답을 확인할 수 없어요. 다시 시도해 주세요.');
      const rows: School[] = Array.from(new Map<string, School>(raw.filter((r: any) => r.SD_SCHUL_CODE && r.ATPT_OFCDC_SC_CODE).map((r: any) => [r.ATPT_OFCDC_SC_CODE + ':' + r.SD_SCHUL_CODE, { schoolName: String(r.SCHUL_NM || ''), schoolCode: String(r.SD_SCHUL_CODE), officeCode: String(r.ATPT_OFCDC_SC_CODE), officeName: String(r.ATPT_OFCDC_SC_NM || ''), schoolKind: String(r.SCHUL_KND_SC_NM || ''), location: String(r.LCTN_SC_NM || '') }])).values());
      rows.sort((a,b) => Number(b.schoolName === keyword) - Number(a.schoolName === keyword) || Number(!!region && b.location.includes(region)) - Number(!!region && a.location.includes(region)) || a.schoolName.localeCompare(b.schoolName, 'ko'));
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(keyword, { until: Date.now() + 5 * 60_000, rows });
      return rows;
    };
    const request = search(); pending.set(keyword, request);
    try { return await request; } finally { pending.delete(keyword); }
  };
}
