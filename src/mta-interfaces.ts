export interface ITrip {
  trainId: string;
  eta: string;
  minAway: string;
  rawEta: number;
}

export interface IStationData {
  name: string;
  trains: ITrip[];
}

export interface IStation {
  [key: string]: IStationData;
}

export interface IJsonResponse {
  stations: IStation;
  status?: string;
  message?: string;
}