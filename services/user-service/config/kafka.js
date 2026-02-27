const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'user-service',
  brokers: [process.env.KAFKA_BROKER || 'my-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092'],
});

const producer = kafka.producer();

const connectProducer = async () => {
  let connected = false;
  while (!connected) {
    try {
      await producer.connect();
      console.log('Kafka Producer connected');
      connected = true;
    } catch (err) {
      console.error('Error connecting Kafka Producer. Retrying in 5s...', err.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

connectProducer();

module.exports = producer;
