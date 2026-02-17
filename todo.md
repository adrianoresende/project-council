=======

While for the FREE plan the limit will be 3 queries per day. It does not involve credit or tokens.
Remember that 1 query is a new conversation executed.
Check if the new conversation is not saved in the database or in the list until the question is sent.

=========

Cria um novo branch focado em nova tela de admin.
Cria novo role dos usuários: `user` e `admin`
Adiciona uma nova página `/admin` apenas para quem é administrador.
A página admin deve ter abas no cabeçalho, as abas são:

**Usuários**

- Mostra a lista de usuários cadastro da plataforma
- As colunas são: email, plano, id stripe de pagamento, data cadastro, data último login
- A ordem é email. A -> Z
- Ao clicar o usuário, abra o drawer esquerda para direita, com os dados e funcionaldiades seguintes:
  - Botão de renovar o crédito ou token do usuário
  - Opção de plano e botão ao lado para salvar

=======
