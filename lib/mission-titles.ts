import { english } from "./translations";
export type MissionTitles={titleTh:string;titleEn:string};
export const titleLanguage=(title:string):"th"|"en"=>/\p{Script=Thai}/u.test(title)?"th":"en";
const thaiByEnglish=new Map(Object.entries(english).map(([th,en])=>[en,th]));
export function knownMissionTitles(title:string):MissionTitles|null{
  const text=title.trim();
  if(english[text])return {titleTh:text,titleEn:english[text]};
  const thai=thaiByEnglish.get(text);if(thai)return {titleTh:thai,titleEn:text};
  const step=text.match(/^(?:Step|ขั้นตอน)\s+(\d+)$/i);if(step)return {titleTh:"ขั้นตอน "+step[1],titleEn:"Step "+step[1]};
  return null;
}
export function missionTitle(step:{title:string;titleTh?:string;titleEn?:string},language:"th"|"en"){
  return (language==="th"?step.titleTh:step.titleEn)||knownMissionTitles(step.title)?.[language==="th"?"titleTh":"titleEn"]||step.title;
}
