export interface Gait {
    baseSpeed:number;
    leftContact?:number;
    rightContact?:number;
    direction?:[number,number];
}
const wrap=(value:number,period:number)=>(value%period+period)%period;
/** Named left/right touchdown intervals, rather than matching clip percentages. */
export function contactPhase(time:number,duration:number,gait:Gait) {
    if(gait.leftContact===undefined || gait.rightContact===undefined) return wrap(time,duration)/duration;
    const offset=wrap(time-gait.leftContact,duration), right=wrap(gait.rightContact-gait.leftContact,duration);
    return offset<right ? .5*offset/right : .5+.5*(offset-right)/(duration-right);
}
export function contactTime(phase:number,duration:number,gait:Gait) {
    if(gait.leftContact===undefined || gait.rightContact===undefined) return wrap(phase,1)*duration;
    const p=wrap(phase,1),right=wrap(gait.rightContact-gait.leftContact,duration);
    return wrap(gait.leftContact+(p<.5 ? p*2*right : right+(p-.5)*2*(duration-right)),duration);
}
