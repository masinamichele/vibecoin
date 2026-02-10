export namespace ChainError {
  class AutoNamedError extends Error {
    override get name() {
      return `${this.constructor.name}Error`;
    }
  }

  export class Ownership extends AutoNamedError {}

  export class OutOfGas extends AutoNamedError {}

  export class DuplicatedToken extends AutoNamedError {}

  export class NonExistentToken extends AutoNamedError {}

  export class MissingData extends AutoNamedError {}

  export class InvalidData extends AutoNamedError {}

  export class InsufficientFunds extends AutoNamedError {}

  export class NonExistentContract extends AutoNamedError {}

  export class DuplicatedContract extends AutoNamedError {}

  export class InvalidSignature extends AutoNamedError {}

  export class InvalidAmount extends AutoNamedError {}

  export class Mining extends AutoNamedError {}

  export class InvalidBlock extends AutoNamedError {}

  export class Unauthorized extends AutoNamedError {}
}
