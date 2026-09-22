import { ArgumentsHost, Catch, ConflictException, HttpException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { Prisma } from "../../generated/prisma/client";

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
	catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
		const mapped: HttpException | null =
			exception.code === "P2002" ? new ConflictException("Cette valeur est déjà utilisée") : null;
		super.catch(mapped ?? exception, host);
	}
}
