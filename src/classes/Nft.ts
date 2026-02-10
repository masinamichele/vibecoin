import { ChainError } from '#errors';
import { hash } from 'node:crypto';

type NftProperties = {
  data: string;
};

export class Nft {
  readonly id: string;
  readonly data: string;

  constructor(properties: NftProperties) {
    this.data = properties.data;
    if (!this.data) throw new ChainError.MissingData();
    this.id = hash('sha256', this.data);
  }
}

export const $ = (data: TemplateStringsArray) => new Nft({ data: data[0] });
