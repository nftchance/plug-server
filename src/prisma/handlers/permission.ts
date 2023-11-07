import {
    EIP712DomainSchema,
    PermissionSchema
} from '@nftchance/emporium-types/zod'

import { z } from 'zod'

import { TRPCError } from '@trpc/server'

import { f } from '@/framework'
import { p } from '@/prisma'

export async function upsertSignedPermission<
    P extends {
        domain: z.infer<typeof EIP712DomainSchema>
        permission: z.infer<typeof PermissionSchema>
        signature: `0x${string}`
    }
>({ domain, permission, signature }: P) {
    const intent = f.build('Permission', permission, domain)

    if (!intent)
        throw new TRPCError({
            code: 'BAD_REQUEST'
        })

    const hash = intent.hash({ domain, message: permission })
    const signer = await intent.address({
        domain,
        signature: signature
    })

    // * Prepare the body to create the Caveat objects if they don't exist.
    const caveats = {
        connectOrCreate: permission.caveats.map(caveat => {
            return {
                where: {
                    permissionId_caveatEnforcer_caveatTerms: {
                        permissionId: hash,
                        caveatEnforcer: caveat.enforcer,
                        caveatTerms: caveat.terms
                    }
                },
                create: {
                    permissionId: hash,
                    caveatEnforcer: caveat.enforcer,
                    caveatTerms: caveat.terms
                }
            }
        })
    }

    const signedPermission = await p.signedPermission.upsert({
        where: {
            permissionId_signature: {
                permissionId: hash,
                signature
            }
        },
        create: {
            address: {
                connectOrCreate: {
                    where: {
                        id: signer
                    },
                    create: {
                        id: signer
                    }
                }
            },
            permission: {
                connectOrCreate: {
                    where: {
                        id: hash
                    },
                    create: {
                        id: hash,
                        domain: {
                            connectOrCreate: {
                                where: {
                                    verifyingContract_name_version_chainId: {
                                        verifyingContract: domain.verifyingContract,
                                        name: domain.name,
                                        version: domain.version,
                                        chainId: domain.chainId
                                    }
                                },

                                create: domain
                            }
                        },
                        delegate: permission.delegate,
                        authority: permission.authority,
                        caveats,
                        salt: permission.salt
                    }
                }
            },
            signature: signature
        },
        update: {}
    })

    return { signer, signedPermission }
}