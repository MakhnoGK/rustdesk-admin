import { Module } from '@nestjs/common';
import { AbPeersService } from './ab-peers.service';
import { AbTagsService } from './ab-tags.service';
import { AddressBooksService } from './address-books.service';
import { CredentialCipherService } from './credential-cipher.service';

@Module({
  providers: [AddressBooksService, AbPeersService, AbTagsService, CredentialCipherService],
  exports: [AddressBooksService, AbPeersService, AbTagsService],
})
export class AddressBooksModule {}
