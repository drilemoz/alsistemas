/**
 * mongoosePlugin.js
 * ─────────────────
 * Plugin global do Mongoose — deve ser o PRIMEIRO import do projeto.
 *
 * Por que arquivo separado?
 *
 * Em ESM, todos os `import` são resolvidos (e os módulos avaliados)
 * antes do corpo do módulo importador executar. Isso significa que
 * um `mongoose.plugin()` no corpo do server.js é registrado DEPOIS
 * de todos os models já terem sido compilados via `mongoose.model()`.
 *
 * Resultado: o plugin não é aplicado a nenhum model.
 *
 * Solução: importar este arquivo como o PRIMEIRO import do server.js
 * (antes de mongoose, routes, models). Assim, quando os demais módulos
 * forem avaliados e chamarem `mongoose.model()`, o plugin já está
 * registrado e será aplicado a todos os schemas.
 *
 * Uso no server.js:
 *   import './plugins/mongoosePlugin.js'   // ← PRIMEIRA linha de import
 *   import express from 'express'
 *   import mongoose from 'mongoose'
 *   // ...
 */
import mongoose from 'mongoose'

mongoose.plugin(schema => {
  schema.set('toJSON', {
    virtuals:   true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret._id?.toString()
      delete ret._id
      return ret
    },
  })
})
