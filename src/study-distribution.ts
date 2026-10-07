export type StudyDistribution = 'exam'|'even';
export const distributionName:Record<StudyDistribution,string> = {exam:'過去問配分',even:'分野均等'};
export const studyDistribution=(value:string|null|undefined):StudyDistribution=>value==='even'?'even':'exam';

export function renderDistribution(value:StudyDistribution,singleField:boolean):string {
  return `<fieldset class="study-distribution" ${singleField?'disabled':''} aria-describedby="study-distribution-help"><legend>出題配分</legend><div class="distribution-options">${(['exam','even'] as const).map(option=>`<label class="distribution-option ${value===option?'on':''}"><input type="radio" name="study-distribution" value="${option}" ${value===option?'checked':''}/><span><strong>${option==='exam'?'過去問の配分で出題':'分野を均等に出題'}</strong><small>${option==='exam'?'過去問100問の構成を使って選ぶ':'幅広い分野をバランスよく学ぶ'}</small></span></label>`).join('')}</div></fieldset><p id="study-distribution-help" class="distribution-help">${singleField?'出題配分は、2つ以上の分野を選ぶと選べます。':value==='even'?'各分野からできるだけ同じ問題数を選びます。問題が足りない分野の分は他の分野から補い、問題は重複しません。':'過去問100問をもとに選びます。ランダム演習では問題数の多い分野ほど出やすく、各回の内訳は変わります。'}</p>`;
}
