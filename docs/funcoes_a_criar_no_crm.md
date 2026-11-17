# Funções a criar no CRM para o Calendário partilhado 2.0 (MR-072)

Todas são funções autónomas (Hub de programador > Funções), chamadas pelo widget com `ZOHO.CRM.FUNCTIONS.execute`.
Os argumentos seguem como texto (JSON em `arguments`); as listas vão separadas por vírgulas.
Devolvem sempre texto: `OK|mensagem` ou `ERRO|mensagem`. A mensagem de erro é mostrada tal e qual ao utilizador e o registo volta ao sítio no widget.
As funções Deluge levam o cabeçalho de 3 linhas (versão | data | autor, referência, descrição) e a flag `DEBUG`.

| Função | Estado | Argumentos | Serve para |
|---|---|---|---|
| `fn_reagendar_entrega_recolha` | existe | recordId, newDateTime | Reagendar Entregas e Recolhas |
| `fn_reagendar_inspecao` | por criar | recordId, entity, newDateTime | Reagendar Inspeções |
| `fn_reagendar_manutencao` | por criar | recordId, entity, newDate, newEndDate | Reagendar Manutenções (dia inteiro) |
| `fn_reagendar_reserva` | por criar | recordId, entity, newDate, newEndDate | Reagendar Reservas |
| `fn_reagendar_comercial` | por criar | recordId, entity (Deals / Quotes / Tasks), newDate ou newDateTime | Fecho previsto, validade do orçamento, follow-up |
| `fn_atribuir_logistica` | por criar | recordId, responsibleId, vehicle | Responsável e Viatura de uma Entrega ou Recolha |
| `fn_atribuir_inspetor` | por criar | recordId, inspectorId | Inspetor de uma Inspeção |
| `fn_atribuir_tecnico` | por criar | recordId, technicianId | Técnico de uma Manutenção |
| `fn_Deals_addEquipmentFromCalendar` | criada no CRM (v1.1, 17/11), por testar | unitLines (idUnidade:início:fim, vírgulas), accountId, contactId, dealId | Pedido de equipamento (decisão Q7), cada equipamento com o seu período |

## Regras de validação (backend)

- Registos em estado final, ou "Em curso", não se alteram (exceção: Reservas, que se reagendam em Pré-reserva e Confirmada).
- Não se agenda no passado (VR17).
- Entregas, Recolhas, Inspeções e Manutenções não se agendam ao domingo.
- Viatura: conflito se outra Entrega/Recolha não final usar a mesma viatura a menos de 90 minutos.
- Reservas: a unidade não pode ter outra Reserva ativa nem Manutenção por concluir a sobrepor o novo período (VR21).
- Entrega "Agendada" que muda de data passa a "Reagendada".
- A atribuição a "Sem atribuição" (vazio) deve ser recusada ou aceite conforme a regra de negócio de cada módulo (a confirmar).

## Decisões ainda assumidas (confirmar com o cliente)

- Q3: a Pré-reserva bloqueia a unidade até à validade.
- Q4: Empresa obrigatória, Cliente opcional no pedido de equipamento.
- Oportunidade ao criar (obrigatórios no layout: Deal_Name, Contact_Name, Customer_Type, Stage, Closing_Date): Stage "Pedido de orçamento", Customer_Type "Empresa (B2B)", Closing_Date = início do aluguer. Confirmar.
- Orçamento em Rascunho (obrigatórios no layout: Subject, Contact_Name, Valid_Till, datas, Delivery_Type): Valid_Till = hoje + 7 dias, Delivery_Type "Levantamento em armazém". Confirmar.
- O estado de rascunho do Orçamento tem o valor interno `Draft` (etiqueta "Rascunho").

## Regra ao criar cada função

Para o widget a conseguir chamar (ZOHO.CRM.FUNCTIONS.execute), a função tem de ter a API de REST com **OAuth2** ativa: Funções, menu "..." da função, API de REST, ligar OAuth2, Guardar. Sem isto o CRM não devolve resultado e o widget mostra "O CRM não respondeu". Confirmado em 17/11 com `fn_Deals_addEquipmentFromCalendar` (estava em "Nenhum"; a `fn_reagendar_entrega_recolha`, que funciona, tem OAuth). O nome de API fica em minúsculas no CRM.
