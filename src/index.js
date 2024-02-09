import express from "express"
import cors from "cors"
import pkg from 'pg';
const { Pool } = pkg;
import 'dotenv/config'

const app = express();

app.use(express.json());
app.use(cors());

const port = 9999;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: +process.env.DB_PORT,
});

pool
    .connect()
    .then(() => console.log("Conectado ao PostgreSQL"))
    .catch((err) => console.error("Erro ao conectar ao PostgreSQL", err))

app.listen(port, () => {
    console.log(`Rodando na porta localhost:${port}`)
});

// Criar transacoes
app.post("/clientes/:id/transacoes", async (req, res) => {
    const { id } = req.params;
    const value = req.body.valor;
    const type = req.body.tipo;
    const description = req.body.descricao;

    try {
        //Validações
        if (!Number.isInteger(Number(id))) {
            res.status(422).send("id precisa ser um número inteiro.")
            return
        }

        if (value < 0 || !Number.isInteger(Number(value))) {
            res.status(422).send("valor precisa ser um número inteiro positivo que represente centavos.")
            return
        }

        if (type !== 'c' && type !== 'd') {
            res.status(422).send("tipo deve ser apenas 'c' para crédito ou 'd' para débito.")
            return
        }

        if (!description || (description && description.length < 0 || description.length > 10)) {
            res.status(422).send("descricao deve ser uma string de 1 a 10 caractéres.")
            return
        }

        const userDb = await pool.query(
            "SELECT * FROM clientes WHERE id = $1",
            [id]
        )

        const user = userDb.rows[0]

        if (!user) {
            res.status(404).send("cliente não encontrado.")
            return
        }

        const balance = await pool.query(
            "SELECT * FROM saldos WHERE cliente_id = $1",
            [id]
        )

        let newBalance = 0

        if (type === 'd') {
            newBalance = balance.rows[0].valor - value
        } else {
            newBalance = balance.rows[0].valor + value
        }

        const isAproved = (newBalance + user.limite) > 0

        if (!isAproved) {
            res.status(422).send("Limite indisponivel")
            return
        }

        await pool.query(
            "INSERT INTO transacoes (cliente_id, valor, tipo, descricao) VALUES ($1, $2, $3, $4) RETURNING *",
            [id, value, type, description]
        );

        await pool.query(
            "UPDATE saldos SET valor = $1 WHERE cliente_id = $2",
            [newBalance, id]
        )

        const response = {
            limite: user.limite,
            saldo: newBalance
        }

        res.status(200).send(response);
    } catch (error) {
        console.error("Erro ao inserir transação no PostgreSQL:", error);
        res.status(500).send("Erro interno do servidor");
    }


});

app.get("/clientes/:id/extrato", async (req, res) => {
    const { id } = req.params

    try {
        if (!Number.isInteger(Number(id))) {
            res.status(422).send("id precisa ser um número inteiro.")
            return
        }

        const userDb = await pool.query(
            "SELECT * FROM clientes WHERE id = $1",
            [id]
        )

        const user = userDb.rows[0]

        if (!user) {
            res.status(404).send("cliente não encontrado.")
            return
        }

        const balanceDb = await pool.query(
            "SELECT * FROM saldos WHERE cliente_id = $1",
            [id]
        )

        const balance = balanceDb.rows[0]

        const transacoesDb = await pool.query(
            "SELECT valor, tipo, descricao, realizada_em FROM transacoes WHERE cliente_id = $1 ORDER BY realizada_em DESC LIMIT 10",
            [id]
        )

        const response = {
            saldo: {
                total: balance.valor,
                data_extrato: new Date(),
                limite: user.limite
            },
            ultimas_transacoes: transacoesDb.rows
        }

        res.status(200).send(response)
    } catch (error) {
        console.log("Erro ao consultar extrato", error)
        res.status(500).send("Erro ao consultar extrato")
    }
});
